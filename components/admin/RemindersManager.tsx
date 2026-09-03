'use client';

import { Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';

import { useRouter } from '@/i18n/navigation';
import { REMINDER_STORED_STATUSES, REMINDER_TYPES } from '@/lib/firm/reminder-types';
import { type ReminderInput, createReminder, deleteReminder, updateReminder } from '@/lib/firm/reminders';

import { dangerButton, inputClass, labelClass, primaryButton, secondaryButton, selectClass, statusPill, textareaClass } from './ui';

export type ReminderItem = {
  id: string;
  reminderType: string;
  title: string;
  amount: string;
  dueDate: string;
  status: string;
  responsible: 'firm' | 'client';
  actionRequired: string;
  published: boolean;
};

type Form = Omit<ReminderInput, 'entityId'>;

const EMPTY: Form = {
  reminderType: 'custom',
  title: '',
  amount: '',
  dueDate: '',
  responsible: 'client',
  actionRequired: '',
  status: 'upcoming',
  published: true,
};

function toForm(r: ReminderItem): Form {
  const status = (REMINDER_STORED_STATUSES as readonly string[]).includes(r.status) ? (r.status as Form['status']) : 'upcoming';
  const reminderType = (REMINDER_TYPES as readonly string[]).includes(r.reminderType) ? (r.reminderType as Form['reminderType']) : 'custom';
  return { reminderType, title: r.title, amount: r.amount, dueDate: r.dueDate, responsible: r.responsible, actionRequired: r.actionRequired, status, published: r.published };
}

// Firm-side reminders for one business: list + inline create/edit form.
export function RemindersManager({ entityId, items, canEdit }: { entityId: string; items: ReminderItem[]; canEdit: boolean }) {
  const t = useTranslations('Admin');
  const router = useRouter();
  const [editing, setEditing] = useState<'new' | string | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function open(target: 'new' | ReminderItem) {
    setError(null);
    if (target === 'new') {
      setForm(EMPTY);
      setEditing('new');
    } else {
      setForm(toForm(target));
      setEditing(target.id);
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = editing === 'new' ? await createReminder({ entityId, ...form }) : await updateReminder({ id: editing, ...form });
      if (!res.ok) return setError(res.error);
      setEditing(null);
      router.refresh();
    });
  }

  function remove(id: string) {
    if (confirmDelete !== id) return setConfirmDelete(id);
    setConfirmDelete(null);
    startTransition(async () => {
      const res = await deleteReminder({ id });
      if (!res.ok) setError(res.error);
      router.refresh();
    });
  }

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }));

  return (
    <div className="flex flex-col gap-4">
      {items.length === 0 ? (
        <p className="text-muted-foreground text-[14px]">{t('noReminders')}</p>
      ) : (
        <ul className="divide-line border-line divide-y overflow-hidden rounded-xl border">
          {items.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-[14px]">
              <span className="min-w-0 flex-1">
                <span className="text-ink block truncate font-semibold">{r.title}</span>
                <span className="text-muted-foreground block text-[12.5px]">
                  {t(`reminderType_${r.reminderType}`)} · {r.dueDate}
                  {r.amount ? ` · ${r.amount}` : ''} · {r.responsible === 'firm' ? t('responsibleFirm') : t('responsibleClient')}
                </span>
              </span>
              <span className={statusPill(r.status === 'paid' || r.status === 'completed' ? 'published' : r.status)}>{t(`reminderStatus_${r.status}`)}</span>
              {!r.published && <span className="bg-secondary text-muted-foreground rounded-full px-2.5 py-1 text-[12px] font-semibold">{t('draft')}</span>}
              {canEdit && (
                <>
                  <button type="button" onClick={() => open(r)} className="text-blue text-[13px] font-semibold hover:underline">
                    {t('editReminder')}
                  </button>
                  <button type="button" disabled={isPending} onClick={() => remove(r.id)} className={dangerButton}>
                    {confirmDelete === r.id ? t('confirmDelete') : t('deleteReminder')}
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {canEdit && editing === null && (
        <div>
          <button type="button" onClick={() => open('new')} className={secondaryButton}>
            <Plus className="size-4" aria-hidden="true" />
            {t('newReminder')}
          </button>
        </div>
      )}

      {canEdit && editing !== null && (
        <form onSubmit={submit} className="border-line bg-paper grid gap-4 rounded-xl border p-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="remTitle" className={labelClass}>{t('reminderTitle')}</label>
            <input id="remTitle" required value={form.title} onChange={(e) => set('title', e.target.value)} className={inputClass} />
          </div>
          <div>
            <label htmlFor="remType" className={labelClass}>{t('reminderType')}</label>
            <select id="remType" value={form.reminderType} onChange={(e) => set('reminderType', e.target.value as Form['reminderType'])} className={selectClass}>
              {REMINDER_TYPES.map((k) => <option key={k} value={k}>{t(`reminderType_${k}`)}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="remDue" className={labelClass}>{t('reminderDue')}</label>
            <input id="remDue" type="date" required value={form.dueDate} onChange={(e) => set('dueDate', e.target.value)} className={inputClass} />
          </div>
          <div>
            <label htmlFor="remAmount" className={labelClass}>{t('reminderAmount')}</label>
            <input id="remAmount" inputMode="decimal" value={form.amount} onChange={(e) => set('amount', e.target.value)} className={inputClass} />
          </div>
          <div>
            <label htmlFor="remResponsible" className={labelClass}>{t('reminderResponsible')}</label>
            <select id="remResponsible" value={form.responsible} onChange={(e) => set('responsible', e.target.value === 'firm' ? 'firm' : 'client')} className={selectClass}>
              <option value="client">{t('responsibleClient')}</option>
              <option value="firm">{t('responsibleFirm')}</option>
            </select>
          </div>
          <div>
            <label htmlFor="remStatus" className={labelClass}>{t('reminderStatus')}</label>
            <select id="remStatus" value={form.status} onChange={(e) => set('status', e.target.value as Form['status'])} className={selectClass}>
              {REMINDER_STORED_STATUSES.map((s) => <option key={s} value={s}>{t(`reminderStatus_${s}`)}</option>)}
            </select>
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2.5 text-[14px]">
              <input type="checkbox" checked={form.published} onChange={(e) => set('published', e.target.checked)} className="accent-blue size-4" />
              {t('reminderPublished')}
            </label>
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="remAction" className={labelClass}>{t('reminderAction')}</label>
            <textarea id="remAction" rows={2} value={form.actionRequired} onChange={(e) => set('actionRequired', e.target.value)} className={textareaClass} />
          </div>
          {error && <p role="alert" className="text-danger text-[13.5px] sm:col-span-2">{error}</p>}
          <div className="flex justify-end gap-3 sm:col-span-2">
            <button type="button" onClick={() => setEditing(null)} className={secondaryButton}>{t('cancel')}</button>
            <button type="submit" disabled={isPending || form.title.trim().length === 0 || !form.dueDate} className={primaryButton}>
              {isPending ? t('saving') : t('save')}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
