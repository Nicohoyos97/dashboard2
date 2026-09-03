'use client';

import { Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useRouter } from '@/i18n/navigation';
import { type ClientInput, createFirmClient, updateFirmClient } from '@/lib/firm/clients';

import { inputClass, labelClass, primaryButton, secondaryButton, textareaClass } from './ui';

const EMPTY: ClientInput = { name: '', contactName: '', contactEmail: '', notes: '' };

// Create / edit a firm client in a modal. On create we jump to the new client
// page so the admin can add its first business right away.
export function ClientDialog({
  mode,
  clientId,
  initial,
}: {
  mode: 'create' | 'edit';
  clientId?: string;
  initial?: ClientInput;
}) {
  const t = useTranslations('Admin');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<ClientInput>(initial ?? EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function set<K extends keyof ClientInput>(key: K, value: ClientInput[K]) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      if (mode === 'create') {
        const res = await createFirmClient(values);
        if (!res.ok) return setError(res.error);
        setOpen(false);
        router.push(`/admin/clients/${res.value.id}`);
        return;
      }
      const res = await updateFirmClient({ id: clientId, ...values });
      if (!res.ok) return setError(res.error);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button type="button" className={mode === 'create' ? primaryButton : secondaryButton}>
          {mode === 'create' && <Plus className="size-4" aria-hidden="true" />}
          {mode === 'create' ? t('newClient') : t('editClient')}
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? t('newClient') : t('editClient')}</DialogTitle>
          <DialogDescription>{t('clientsLede')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div>
            <label htmlFor="clientName" className={labelClass}>
              {t('clientName')}
            </label>
            <input
              id="clientName"
              required
              value={values.name}
              onChange={(e) => set('name', e.target.value)}
              className={inputClass}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="contactName" className={labelClass}>
                {t('contactName')}
              </label>
              <input
                id="contactName"
                value={values.contactName}
                onChange={(e) => set('contactName', e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="contactEmail" className={labelClass}>
                {t('contactEmail')}
              </label>
              <input
                id="contactEmail"
                type="email"
                value={values.contactEmail}
                onChange={(e) => set('contactEmail', e.target.value)}
                className={inputClass}
              />
            </div>
          </div>
          <div>
            <label htmlFor="clientNotes" className={labelClass}>
              {t('notesInternal')}
            </label>
            <textarea
              id="clientNotes"
              rows={3}
              value={values.notes}
              onChange={(e) => set('notes', e.target.value)}
              className={textareaClass}
            />
          </div>
          {error && (
            <p role="alert" className="text-danger text-[13.5px]">
              {error}
            </p>
          )}
          <div className="mt-2 flex justify-end gap-3">
            <button type="button" onClick={() => setOpen(false)} className={secondaryButton}>
              {t('cancel')}
            </button>
            <button
              type="submit"
              disabled={isPending || values.name.trim().length === 0}
              className={primaryButton}
            >
              {isPending
                ? mode === 'create'
                  ? t('creating')
                  : t('saving')
                : mode === 'create'
                  ? t('create')
                  : t('save')}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
