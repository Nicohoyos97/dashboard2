import { getLocale, getTranslations } from 'next-intl/server';

import type { CrossCheck } from '@/lib/documents/cross-check';
import type { Reconciliation } from '@/lib/documents/reconciliation';
import { posSystemLabel } from '@/lib/ingestion/schemas/sales-report';

import { SalesReportForm } from './SalesReportForm';
import { formatPeriod } from '@/lib/utils/dates';
import { formatAmount, formatCents } from '@/lib/money';

export type SalesReportSummary = {
  id: string;
  sourceSystem: string;
  periodStart: string;
  periodEnd: string;
  currency: string;
  grossSales: number | null;
  netSales: number | null;
  refunds: number | null;
  discounts: number | null;
  tips: number | null;
  taxCollected: number | null;
  taxExpected: number | null;
  amountCollected: number | null;
  orderCount: number | null;
  reconciliation: Reconciliation | null;
};

export type TenderRow = { id: string; label: string; amount: number };

/** A figure the report did not print stays an empty box, not a 0. */
const box = (value: number | null): string => (value === null ? '' : value.toFixed(2));

// What the point-of-sale report says was sold, and — when the filing for the
// same period has also been extracted — how the two compare.
//
// The cross-check is a warning, never a blocker: a legitimate gap is common
// (marketplace facilitators remit their own tax, exempt sales, timing), so the
// firm is told the number and left to judge it.
export async function SalesReportReview({
  report,
  tenders,
  crossCheck,
  canEdit,
}: {
  report: SalesReportSummary;
  tenders: TenderRow[];
  crossCheck: CrossCheck | null;
  canEdit: boolean;
}) {
  const [t, locale] = await Promise.all([getTranslations('Admin'), getLocale()]);
  const fmt = (v: number | null) =>
    v === null ? '—' : formatAmount(v, report.currency);
  const money = (cents: number) =>
    formatCents(Math.abs(cents), report.currency);
  const rec = report.reconciliation;

  // Only what the report actually printed. A figure it omitted is left out
  // rather than shown as a dash beside real ones.
  const figures: [string, number | null][] = [
    [t('salesGross'), report.grossSales],
    [t('salesNet'), report.netSales],
    [t('salesRefunds'), report.refunds],
    [t('salesDiscounts'), report.discounts],
    [t('salesTips'), report.tips],
    [t('salesTaxCollected'), report.taxCollected],
    [t('salesTaxExpected'), report.taxExpected],
    [t('salesAmountCollected'), report.amountCollected],
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3 text-[13.5px]">
        <span className={`rounded-full px-2.5 py-1 font-semibold ${rec?.passed ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'}`}>
          {rec?.passed ? t('reconciliationPassed') : t('reconciliationFailed')}
        </span>
        <span className="text-muted-foreground">
          {t('salesReportSource')}: {posSystemLabel(report.sourceSystem, t('salesSourceOther'))} ·{' '}
          {formatPeriod(report.periodStart, report.periodEnd, locale)}
          {report.orderCount !== null && ` · ${report.orderCount} ${t('salesOrders').toLowerCase()}`}
        </span>
      </div>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-2.5 text-[14px] sm:grid-cols-4">
        {figures
          .filter(([, value]) => value !== null)
          .map(([label, value]) => (
            <div key={label}>
              <dt className="text-muted-foreground text-[12.5px]">{label}</dt>
              <dd className="text-ink font-semibold tabular-nums">{fmt(value)}</dd>
            </div>
          ))}
      </dl>

      {rec && rec.checks.length > 0 && (
        <ul className="border-line divide-line divide-y rounded-xl border text-[13.5px]">
          {rec.checks.map((c) => (
            <li key={c.key} className="flex items-center gap-3 px-4 py-2.5">
              <span className={`size-2.5 shrink-0 rounded-full ${c.ok ? 'bg-success' : 'bg-danger'}`} aria-hidden="true" />
              <span className="text-ink flex-1 font-medium">{c.label}</span>
              <span className="text-muted-foreground">
                {c.ok ? 'OK' : `${t('expected')} ${money(c.expectedCents ?? 0)} · ${t('actual')} ${money(c.actualCents ?? 0)}`}
              </span>
            </li>
          ))}
        </ul>
      )}

      {tenders.length > 0 && (
        <div>
          <h3 className="text-muted-foreground text-[11px] font-semibold tracking-[0.12em] uppercase">
            {t('salesTenders')}
          </h3>
          <ul className="border-line divide-line mt-2 divide-y rounded-xl border text-[13.5px]">
            {tenders.map((tender) => (
              <li key={tender.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <span className="text-ink">{tender.label}</span>
                <span className="text-muted-foreground tabular-nums">{fmt(tender.amount)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {crossCheck && <CrossCheckNotice check={crossCheck} money={money} />}

      {/* A figure the extractor read wrong is corrected here rather than by
          re-uploading: the firm has the document in front of them. */}
      <SalesReportForm
        reportId={report.id}
        canEdit={canEdit}
        initial={{
          grossSales: box(report.grossSales),
          netSales: box(report.netSales),
          refunds: box(report.refunds),
          discounts: box(report.discounts),
          tips: box(report.tips),
          taxCollected: box(report.taxCollected),
          taxExpected: box(report.taxExpected),
          amountCollected: box(report.amountCollected),
        }}
      />
    </div>
  );
}

async function CrossCheckNotice({
  check,
  money,
}: {
  check: CrossCheck;
  money: (cents: number) => string;
}) {
  const t = await getTranslations('Admin');
  if (check.kind === 'no_pair') return null;

  const tone =
    check.kind === 'ok'
      ? 'border-success/30 bg-success/5'
      : 'border-warning/40 bg-warning/5';

  return (
    <section className={`rounded-xl border p-4 ${tone}`}>
      <h3 className="text-ink text-[14px] font-semibold">{t('crossCheckTitle')}</h3>
      {check.kind === 'ok' ? (
        <p className="text-muted-foreground mt-1.5 text-[13.5px]">{t('crossCheckOk')}</p>
      ) : (
        <ul className="text-ink mt-1.5 flex flex-col gap-1.5 text-[13.5px]">
          {check.sales && (
            <li>
              {t('crossCheckSales', {
                filed: money(check.sales.filedCents),
                sold: money(check.sales.soldCents),
                difference: money(check.sales.differenceCents),
              })}
            </li>
          )}
          {check.tax && (
            <li>
              {t('crossCheckTax', {
                collected: money(check.tax.collectedCents),
                payable: money(check.tax.payableCents),
                difference: money(check.tax.differenceCents),
              })}
            </li>
          )}
        </ul>
      )}
    </section>
  );
}
