// Document queue across every business (INITIAL_PROMPT.md §8): filter by
// processing status, open a document to review it.
import { getLocale, getTranslations } from 'next-intl/server';

import { card, statusPill } from '@/components/admin/ui';
import { Link } from '@/i18n/navigation';
import { requireFirmMember } from '@/lib/auth/requireFirm';
import { createClient } from '@/lib/supabase/server';

export const DOCUMENT_STATUSES = [
  'uploaded',
  'processing',
  'needs_review',
  'reconciled',
  'ready_to_publish',
  'published',
  'failed',
  'superseded',
] as const;

type Status = (typeof DOCUMENT_STATUSES)[number];

function isStatus(value: string | undefined): value is Status {
  return DOCUMENT_STATUSES.includes(value as Status);
}

export default async function DocumentsQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const [, t, locale, params] = await Promise.all([
    requireFirmMember(),
    getTranslations('Admin'),
    getLocale(),
    searchParams,
  ]);
  const status = isStatus(params.status) ? params.status : null;

  const supabase = await createClient();
  let query = supabase
    .from('documents')
    .select('id, title, document_type, status, period_start, period_end, updated_at, business_entities ( name )')
    .order('updated_at', { ascending: false })
    .limit(200);
  if (status) query = query.eq('status', status);
  const { data: docs } = await query;

  const dateFmt = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });
  const tabs: { key: Status | null; label: string }[] = [
    { key: null, label: t('statusAll') },
    ...DOCUMENT_STATUSES.map((s) => ({ key: s, label: t(`status_${s}`) })),
  ];

  return (
    <main className="mx-auto w-full max-w-[1200px] px-6 py-10 md:px-10">
      <h1 className="text-ink text-[28px] font-bold tracking-[-0.01em]">{t('documentsQueueTitle')}</h1>
      <p className="text-muted-foreground mt-1.5 max-w-[640px] text-[15px]">{t('documentsQueueLede')}</p>

      <nav aria-label={t('statusLabel')} className="mt-6 flex flex-wrap gap-2">
        {tabs.map((tab) => {
          const active = tab.key === status;
          return (
            <Link
              key={tab.key ?? 'all'}
              href={tab.key ? `/admin/documents?status=${tab.key}` : '/admin/documents'}
              aria-current={active ? 'page' : undefined}
              className={
                active
                  ? 'bg-blue-pale text-blue rounded-full px-3 py-1.5 text-[13px] font-semibold'
                  : 'text-muted-foreground hover:bg-secondary hover:text-ink rounded-full px-3 py-1.5 text-[13px] font-medium'
              }
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>

      <section className={`${card} mt-4 overflow-x-auto p-0`}>
        {(docs ?? []).length === 0 ? (
          <p className="text-muted-foreground p-6 text-[14.5px]">{t('noDocumentsQueue')}</p>
        ) : (
          <table className="w-full text-left text-[14px]">
            <thead className="text-muted-foreground border-line border-b text-[12px] font-semibold tracking-[0.06em] uppercase">
              <tr>
                <th className="px-5 py-3">{t('colDocument')}</th>
                <th className="px-5 py-3">{t('colBusiness')}</th>
                <th className="px-5 py-3">{t('colType')}</th>
                <th className="px-5 py-3">{t('colPeriod')}</th>
                <th className="px-5 py-3">{t('statusLabel')}</th>
                <th className="px-5 py-3">{t('updatedAt')}</th>
              </tr>
            </thead>
            <tbody className="divide-line divide-y">
              {(docs ?? []).map((d) => (
                <tr key={d.id} className="hover:bg-paper">
                  <td className="px-5 py-3.5">
                    <Link href={`/admin/documents/${d.id}`} className="text-ink hover:text-blue font-semibold">
                      {d.title}
                    </Link>
                  </td>
                  <td className="text-muted-foreground px-5 py-3.5">{d.business_entities?.name ?? '—'}</td>
                  <td className="text-muted-foreground px-5 py-3.5">{t(`type_${d.document_type}`)}</td>
                  <td className="text-muted-foreground px-5 py-3.5 whitespace-nowrap">
                    {d.period_start && d.period_end
                      ? `${dateFmt.format(new Date(d.period_start))} – ${dateFmt.format(new Date(d.period_end))}`
                      : '—'}
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={statusPill(d.status)}>{t(`status_${d.status}`)}</span>
                  </td>
                  <td className="text-muted-foreground px-5 py-3.5 whitespace-nowrap">
                    {dateFmt.format(new Date(d.updated_at))}
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
