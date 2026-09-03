// Business detail: configuration, people with access, firm notes, documents.
import { ChevronLeft } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';

import { EntityDialog } from '@/components/admin/EntityDialog';
import { MemberManager, type MemberRow } from '@/components/admin/MemberManager';
import { NotesForm } from '@/components/admin/NotesForm';
import { type ReminderItem, RemindersManager } from '@/components/admin/RemindersManager';
import { StatusButton } from '@/components/admin/StatusButton';
import { card, statusPill } from '@/components/admin/ui';
import { Link } from '@/i18n/navigation';
import { previewEntity } from '@/lib/entities/actions';
import { requireFirmMember } from '@/lib/auth/requireFirm';
import type { EnabledModules } from '@/lib/firm/entities';
import { createClient } from '@/lib/supabase/server';
import { formatPeriod } from '@/lib/utils/dates';

function modulesOf(value: unknown): EnabledModules {
  const v = (value ?? {}) as Partial<Record<keyof EnabledModules, unknown>>;
  return { expenses: v.expenses !== false, income_taxes: v.income_taxes !== false };
}

function memberRole(role: string): MemberRow['role'] {
  return role === 'client_owner' ? 'client_owner' : 'client_viewer';
}

export default async function EntityDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const [firm, t, locale, { id }] = await Promise.all([
    requireFirmMember(),
    getTranslations('Admin'),
    getLocale(),
    params,
  ]);
  const supabase = await createClient();
  const [{ data: entity }, { data: memberships }, { data: notes }, { data: documents }, { data: reminders }] =
    await Promise.all([
      supabase
        .from('business_entities')
        .select(
          'id, name, legal_name, fiscal_year_start_month, accounting_basis, currency, sales_tax_enabled, enabled_modules, status, client_id, clients ( id, name )',
        )
        .eq('id', id)
        .maybeSingle(),
      supabase.from('entity_memberships').select('user_id, role').eq('business_entity_id', id),
      supabase.from('entity_firm_notes').select('notes').eq('business_entity_id', id).maybeSingle(),
      supabase
        .from('documents')
        .select('id, title, document_type, status, period_start, period_end, updated_at')
        .eq('business_entity_id', id)
        .order('updated_at', { ascending: false })
        .limit(50),
      supabase
        .from('reminders')
        .select('id, reminder_type, title, amount, due_date, status, responsible, action_required, published_at')
        .eq('business_entity_id', id)
        .order('due_date')
        .limit(200),
    ]);
  if (!entity) notFound();

  const reminderItems: ReminderItem[] = (reminders ?? []).map((r) => ({
    id: r.id,
    reminderType: r.reminder_type,
    title: r.title,
    amount: r.amount === null ? '' : r.amount.toFixed(2),
    dueDate: r.due_date,
    status: r.status,
    responsible: r.responsible === 'firm' ? 'firm' : 'client',
    actionRequired: r.action_required ?? '',
    published: r.published_at !== null,
  }));

  const userIds = (memberships ?? []).map((m) => m.user_id);
  const { data: profiles } = userIds.length
    ? await supabase.from('profiles').select('id, full_name, email').in('id', userIds)
    : { data: [] };
  const byId = new Map((profiles ?? []).map((p) => [p.id, p]));
  const members: MemberRow[] = (memberships ?? [])
    .map((m) => ({
      userId: m.user_id,
      name: byId.get(m.user_id)?.full_name?.trim() ?? '',
      email: byId.get(m.user_id)?.email ?? '',
      role: memberRole(m.role),
    }))
    .sort((a, b) => a.role.localeCompare(b.role) || a.name.localeCompare(b.name));

  const canEdit = firm.role === 'master_admin';
  const status = entity.status === 'archived' ? 'archived' : 'active';
  const modules = modulesOf(entity.enabled_modules);
  const month = new Intl.DateTimeFormat(locale, { month: 'long' }).format(
    new Date(2026, entity.fiscal_year_start_month - 1, 1),
  );
  const config: [string, string][] = [
    [t('legalName'), entity.legal_name ?? '—'],
    [t('fiscalYearStart'), month],
    [t('accountingBasis'), entity.accounting_basis === 'accrual' ? t('basisAccrual') : t('basisCash')],
    [t('currency'), entity.currency],
    [
      t('modules'),
      [
        modules.expenses ? t('moduleExpenses') : null,
        modules.income_taxes ? t('moduleIncomeTaxes') : null,
        entity.sales_tax_enabled ? t('moduleSalesTaxes') : null,
      ]
        .filter(Boolean)
        .join(' · ') || '—',
    ],
  ];

  return (
    <main className="mx-auto w-full max-w-[1200px] px-6 py-10 md:px-10">
      <Link
        href={`/admin/clients/${entity.client_id}`}
        className="text-muted-foreground hover:text-ink inline-flex items-center gap-1 text-[13.5px] font-medium"
      >
        <ChevronLeft className="size-4" aria-hidden="true" />
        {t('backToClient')}
      </Link>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-ink flex items-center gap-3 text-[28px] font-bold tracking-[-0.01em]">
            {entity.name}
            <span className={statusPill(status)}>{t(status)}</span>
          </h1>
          <p className="text-muted-foreground mt-1.5 text-[15px]">
            {t('client')}: {entity.clients?.name ?? '—'}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <form action={previewEntity.bind(null, { entityId: entity.id })}>
            <button type="submit" className="border-line bg-card text-ink hover:bg-secondary inline-flex h-11 items-center justify-center gap-2 rounded-lg border px-4 text-[14px] font-semibold transition">
              {t('previewAsClient')}
            </button>
          </form>
        {canEdit && (
          <div className="flex gap-3">
            <EntityDialog
              mode="edit"
              entityId={entity.id}
              initial={{
                name: entity.name,
                legalName: entity.legal_name ?? '',
                fiscalYearStartMonth: entity.fiscal_year_start_month,
                accountingBasis: entity.accounting_basis === 'accrual' ? 'accrual' : 'cash',
                currency: entity.currency,
                salesTaxEnabled: entity.sales_tax_enabled,
                enabledModules: modules,
              }}
            />
            <StatusButton kind="entity" id={entity.id} status={status} />
          </div>
        )}
        </div>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_1fr]">
        <section className={card}>
          <h2 className="text-ink text-[17px] font-semibold">{t('configTitle')}</h2>
          <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2.5 text-[14px]">
            {config.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="text-ink font-medium">{v}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className={card}>
          <h2 className="text-ink text-[17px] font-semibold">{t('notesTitle')}</h2>
          <p className="text-muted-foreground mt-1 mb-4 text-[13.5px]">{t('notesLede')}</p>
          <NotesForm entityId={entity.id} initialNotes={notes?.notes ?? ''} canEdit={canEdit} />
        </section>
      </div>

      <section className={`${card} mt-6`}>
        <h2 className="text-ink text-[17px] font-semibold">{t('membersTitle')}</h2>
        <p className="text-muted-foreground mt-1 mb-4 max-w-[720px] text-[13.5px]">{t('membersLede')}</p>
        <MemberManager entityId={entity.id} members={members} canEdit={canEdit && status === 'active'} />
      </section>

      <section className={`${card} mt-6`}>
        <h2 className="text-ink text-[17px] font-semibold">{t('remindersTitle')}</h2>
        <p className="text-muted-foreground mt-1 mb-4 max-w-[720px] text-[13.5px]">{t('remindersLede')}</p>
        <RemindersManager entityId={entity.id} items={reminderItems} canEdit={canEdit && status === 'active'} />
      </section>

      <section className={`${card} mt-6`}>
        <h2 className="text-ink text-[17px] font-semibold">{t('documentsTitle')}</h2>
        {(documents ?? []).length === 0 ? (
          <p className="text-muted-foreground mt-2 text-[14px]">{t('noDocuments')}</p>
        ) : (
          <ul className="divide-line mt-4 divide-y">
            {(documents ?? []).map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-3 py-3 text-[14px]">
                <span className="text-ink min-w-0 flex-1 truncate font-semibold">{d.title}</span>
                <span className="text-muted-foreground">{formatPeriod(d.period_start, d.period_end, locale)}</span>
                <span className={statusPill(d.status)}>{d.status.replace('_', ' ')}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
