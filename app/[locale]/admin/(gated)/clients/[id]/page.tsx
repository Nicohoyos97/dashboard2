// Client detail: contact, internal notes, and the businesses it owns.
import { ChevronLeft } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';

import { ClientDialog } from '@/components/admin/ClientDialog';
import { EntityDialog } from '@/components/admin/EntityDialog';
import { StatusButton } from '@/components/admin/StatusButton';
import { card, statusPill } from '@/components/admin/ui';
import { Link } from '@/i18n/navigation';
import { requireFirmMember } from '@/lib/auth/requireFirm';
import { createClient } from '@/lib/supabase/server';

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const [firm, t, { id }] = await Promise.all([
    requireFirmMember(),
    getTranslations('Admin'),
    params,
  ]);
  const supabase = await createClient();
  const [{ data: client }, { data: entities }] = await Promise.all([
    supabase
      .from('clients')
      .select('id, name, contact_name, contact_email, notes, status')
      .eq('id', id)
      .maybeSingle(),
    supabase
      .from('business_entities')
      .select('id, name, accounting_basis, currency, sales_tax_enabled, status, entity_memberships(count)')
      .eq('client_id', id)
      .order('name'),
  ]);
  if (!client) notFound();

  const canEdit = firm.role === 'master_admin';
  const status = client.status === 'archived' ? 'archived' : 'active';

  return (
    <main className="mx-auto w-full max-w-[1200px] px-6 py-10 md:px-10">
      <Link
        href="/admin/clients"
        className="text-muted-foreground hover:text-ink inline-flex items-center gap-1 text-[13.5px] font-medium"
      >
        <ChevronLeft className="size-4" aria-hidden="true" />
        {t('backToClients')}
      </Link>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-ink flex items-center gap-3 text-[28px] font-bold tracking-[-0.01em]">
            {client.name}
            <span className={statusPill(status)}>{t(status)}</span>
          </h1>
          <p className="text-muted-foreground mt-1.5 text-[15px]">
            {[client.contact_name, client.contact_email].filter(Boolean).join(' · ') || '—'}
          </p>
        </div>
        {canEdit && (
          <div className="flex gap-3">
            <ClientDialog
              mode="edit"
              clientId={client.id}
              initial={{
                name: client.name,
                contactName: client.contact_name ?? '',
                contactEmail: client.contact_email ?? '',
                notes: client.notes ?? '',
              }}
            />
            <StatusButton kind="client" id={client.id} status={status} />
          </div>
        )}
      </div>

      {client.notes && (
        <section className={`${card} mt-8`}>
          <h2 className="text-muted-foreground text-[11px] font-semibold tracking-[0.12em] uppercase">
            {t('notesInternal')}
          </h2>
          <p className="text-ink mt-2 text-[14.5px] whitespace-pre-wrap">{client.notes}</p>
        </section>
      )}

      <section className="mt-8">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-ink text-[20px] font-bold tracking-[-0.01em]">{t('businesses')}</h2>
          {canEdit && status === 'active' && <EntityDialog mode="create" clientId={client.id} />}
        </div>
        <div className={`${card} mt-4 overflow-x-auto p-0`}>
          {(entities ?? []).length === 0 ? (
            <p className="text-muted-foreground p-6 text-[14.5px]">{t('noBusinesses')}</p>
          ) : (
            <table className="w-full text-left text-[14px]">
              <thead className="text-muted-foreground border-line border-b text-[12px] font-semibold tracking-[0.06em] uppercase">
                <tr>
                  <th className="px-5 py-3">{t('name')}</th>
                  <th className="px-5 py-3">{t('accountingBasis')}</th>
                  <th className="px-5 py-3">{t('currency')}</th>
                  <th className="px-5 py-3">{t('membersTitle')}</th>
                  <th className="px-5 py-3">{t('statusLabel')}</th>
                </tr>
              </thead>
              <tbody className="divide-line divide-y">
                {(entities ?? []).map((e) => (
                  <tr key={e.id} className="hover:bg-paper">
                    <td className="px-5 py-3.5">
                      <Link href={`/admin/entities/${e.id}`} className="text-ink hover:text-blue font-semibold">
                        {e.name}
                      </Link>
                    </td>
                    <td className="text-muted-foreground px-5 py-3.5">
                      {e.accounting_basis === 'accrual' ? t('basisAccrual') : t('basisCash')}
                    </td>
                    <td className="text-muted-foreground px-5 py-3.5">{e.currency}</td>
                    <td className="text-muted-foreground px-5 py-3.5">
                      {e.entity_memberships[0]?.count ?? 0}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={statusPill(e.status)}>
                        {e.status === 'active' ? t('active') : t('archived')}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </main>
  );
}
