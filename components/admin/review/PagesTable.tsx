import { getTranslations } from 'next-intl/server';

export type PageRow = {
  pageNumber: number;
  kind: string | null;
  reportType: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  confidence: number | null;
};

// Per-page classification from pass 1 (letter / statement / notes / other).
// Only `financial_statement` pages ever reach extraction.
export async function PagesTable({ pages }: { pages: PageRow[] }) {
  const t = await getTranslations('Admin');
  if (pages.length === 0) return <p className="text-muted-foreground text-[14px]">{t('noPagesYet')}</p>;

  return (
    <table className="w-full text-left text-[13.5px]">
      <thead className="text-muted-foreground border-line border-b text-[12px] font-semibold tracking-[0.06em] uppercase">
        <tr>
          <th className="px-3 py-2">{t('colPage')}</th>
          <th className="px-3 py-2">{t('colKind')}</th>
          <th className="px-3 py-2">{t('colReportType')}</th>
          <th className="px-3 py-2">{t('colPeriod')}</th>
          <th className="px-3 py-2 text-right">{t('colConfidence')}</th>
        </tr>
      </thead>
      <tbody className="divide-line divide-y">
        {pages.map((p) => (
          <tr key={p.pageNumber} className={p.kind === 'financial_statement' ? '' : 'text-muted-foreground'}>
            <td className="px-3 py-2 font-semibold">{p.pageNumber}</td>
            <td className="px-3 py-2">{p.kind ? t(`kind_${p.kind}`) : '—'}</td>
            <td className="px-3 py-2">{p.reportType ? t(`type_${p.reportType === 'sales_tax' ? 'sales_tax_filing' : p.reportType === 'income_tax' ? 'income_tax_document' : p.reportType === 'payroll' ? 'payroll_summary' : p.reportType === 'other' ? 'other_report' : p.reportType}`) : '—'}</td>
            <td className="px-3 py-2">{p.periodStart && p.periodEnd ? `${p.periodStart} – ${p.periodEnd}` : '—'}</td>
            <td className="px-3 py-2 text-right">{p.confidence === null ? '' : `${Math.round(p.confidence * 100)}%`}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
