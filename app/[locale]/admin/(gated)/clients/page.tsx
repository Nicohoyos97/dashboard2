// Client directory (INITIAL_PROMPT.md §8). Read through RLS as the firm user;
// write controls only for master_admin (firm_staff is read-only).
import { getTranslations } from 'next-intl/server';

import { ClientDialog } from '@/components/admin/ClientDialog';
import { card, statusPill } from '@/components/admin/ui';
import { Link } from '@/i18n/navigation';
import { requireFirmMember } from '@/lib/auth/requireFirm';
import { createClient } from '@/lib/supabase/server';

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ archived?: string }>;
}) {
  const [firm, t, params] = await Promise.all([
    requireFirmMember(),
    getTranslations('Admin'),
    searchParams,
  ]);
  const showArchived = params.archived === '1';

  const supabase = await createClient();
  const { data } = await supabase
    .from('clients')
    .select('id, name, contact_name, contact_email, status, business_entities(count)')
    .order('name');
  const clients = (data ?? []).filter((c) => showArchived || c.status === 'active');

  return (
    <main className="mx-auto w-full max-w-[1200px] px-6 py-10 md:px-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-ink text-[28px] font-bold tracking-[-0.01em]">{t('clientsTitle')}</h1>
          <p className="text-muted-foreground mt-1.5 max-w-[640px] text-[15px]">{t('clientsLede')}</p>
        </div>
        {firm.role === 'master_admin' && <ClientDialog mode="create" />}
      </div>

      <div className="mt-6 flex items-center justify-end">
        <Link
          href={showArchived ? '/admin/clients' : '/admin/clients?archived=1'}
          className="text-muted-foreground hover:text-ink text-[13.5px] font-medium"
        >
          {showArchived ? t('active') : t('showArchived')}
        </Link>
      </div>

      <section className={`${card} mt-3 overflow-x-auto p-0`}>
        {clients.length === 0 ? (
          <p className="text-muted-foreground p-6 text-[14.5px]">{t('noClients')}</p>
        ) : (
          <table className="w-full text-left text-[14px]">
            <thead className="text-muted-foreground border-line border-b text-[12px] font-semibold tracking-[0.06em] uppercase">
              <tr>
                <th className="px-5 py-3">{t('name')}</th>
                <th className="px-5 py-3">{t('contact')}</th>
                <th className="px-5 py-3">{t('businesses')}</th>
                <th className="px-5 py-3">{t('statusLabel')}</th>
              </tr>
            </thead>
            <tbody className="divide-line divide-y">
              {clients.map((c) => (
                <tr key={c.id} className="hover:bg-paper">
                  <td className="px-5 py-3.5">
                    <Link href={`/admin/clients/${c.id}`} className="text-ink hover:text-blue font-semibold">
                      {c.name}
                    </Link>
                  </td>
                  <td className="text-muted-foreground px-5 py-3.5">
                    {c.contact_name ?? ''}
                    {c.contact_name && c.contact_email ? ' · ' : ''}
                    {c.contact_email ?? ''}
                  </td>
                  <td className="text-muted-foreground px-5 py-3.5">
                    {t('businessesCount', { count: c.business_entities[0]?.count ?? 0 })}
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={statusPill(c.status)}>
                      {c.status === 'active' ? t('active') : t('archived')}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
