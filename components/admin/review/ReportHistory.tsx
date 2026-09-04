import { getLocale, getTranslations } from 'next-intl/server';

import { Link } from '@/i18n/navigation';
import type { DerivedHistoryRow } from '@/lib/documents/history';
import { formatPeriod } from '@/lib/utils/dates';

import { card, statusPill } from '../ui';

// Every report and bank statement this document ever produced, superseded ones
// included (spec §14.19). A replaced record keeps its row and points at what
// replaced it — the client no longer sees it, the firm always can.
export async function ReportHistory({ rows }: { rows: DerivedHistoryRow[] }) {
  const [t, locale] = await Promise.all([getTranslations('Admin'), getLocale()]);
  if (rows.length === 0) return null;
  const fmt = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' });

  return (
    <section className={`${card} mt-6 overflow-x-auto p-0`}>
      <h2 className="text-ink px-6 pt-5 text-[17px] font-semibold">{t('reportHistoryTitle')}</h2>
      <p className="text-muted-foreground px-6 pt-1 text-[13px]">{t('reportHistoryLede')}</p>
      <table className="mt-3 w-full text-left text-[13.5px]">
        <thead className="text-muted-foreground border-line border-b text-[12px] font-semibold tracking-[0.06em] uppercase">
          <tr>
            <th className="px-6 py-2.5">{t('colVersion')}</th>
            <th className="px-6 py-2.5">{t('colType')}</th>
            <th className="px-6 py-2.5">{t('colPeriod')}</th>
            <th className="px-6 py-2.5">{t('statusLabel')}</th>
            <th className="px-6 py-2.5">{t('publishedAt')}</th>
            <th className="px-6 py-2.5">{t('colReplacedBy')}</th>
          </tr>
        </thead>
        <tbody className="divide-line divide-y">
          {rows.map((row) => (
            <tr key={`${row.kind}:${row.id}`} className={row.status === 'superseded' ? 'opacity-70' : undefined}>
              <td className="text-ink px-6 py-2.5 font-semibold">v{row.versionNo ?? '?'}</td>
              <td className="text-ink px-6 py-2.5">{row.reportType ? t(`type_${row.reportType}`) : `${t('type_bank_statement')}${row.label ? ` · ${row.label}` : ''}`}</td>
              <td className="text-muted-foreground px-6 py-2.5 whitespace-nowrap">{formatPeriod(row.periodStart, row.periodEnd, locale)}</td>
              <td className="px-6 py-2.5"><span className={statusPill(row.status)}>{t(`status_${row.status}`)}</span></td>
              <td className="text-muted-foreground px-6 py-2.5 whitespace-nowrap">{row.publishedAt ? fmt.format(new Date(row.publishedAt)) : '—'}</td>
              <td className="text-muted-foreground px-6 py-2.5 whitespace-nowrap">
                {!row.replacedBy ? (
                  '—'
                ) : row.replacedBy.documentId ? (
                  <Link href={`/admin/documents/${row.replacedBy.documentId}`} className="text-blue font-medium">
                    {row.replacedBy.at ? fmt.format(new Date(row.replacedBy.at)) : t('reportHistoryReplacement')}
                  </Link>
                ) : (
                  (row.replacedBy.at ? fmt.format(new Date(row.replacedBy.at)) : t('reportHistoryReplacement'))
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
