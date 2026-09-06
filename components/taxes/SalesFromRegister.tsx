import { getLocale, getTranslations } from 'next-intl/server';

import { AmountBars } from '@/components/charts/AmountBars';
import { posSystemLabel } from '@/lib/ingestion/schemas/sales-report';
import type { PortalSalesReport } from '@/lib/portal/load';
import { formatCents } from '@/lib/money';
import { formatPeriod } from '@/lib/utils/dates';

// The client's own point-of-sale figures for a period (0022), as bars.
//
// Deliberately above the filing figures on the page and labelled as sales:
// these two sets of numbers describe the same month and are routinely
// confused, so the page says which is which rather than leaving the reader to
// work out why "taxable receipts" is smaller than what they rang up.
//
// Gross sales and the amount collected stay as figures rather than bars: the
// bars are what gross became (net, after refunds and discounts) plus what the
// register held on top of it (tips, tax), so a bar for the total would sit
// beside its own parts.
export async function SalesFromRegister({ report }: { report: PortalSalesReport }) {
  const [t, locale] = await Promise.all([getTranslations('Taxes'), getLocale()]);
  const money = (cents: number | null) => (cents === null ? null : formatCents(cents, report.currency));

  const totals: [string, number | null][] = [
    [t('posGross'), report.grossSalesCents],
    [t('posCollected'), report.amountCollectedCents],
  ];
  const shownTotals = totals.filter(([, value]) => value !== null);

  return (
    <section className="border-line bg-card rounded-2xl border p-6">
      <h2 className="text-ink text-[18px] font-bold tracking-[-0.01em]">{t('posTitle')}</h2>
      <p className="text-muted-foreground mt-1.5 text-[14px]">{t('posLede')}</p>
      <p className="text-muted-foreground mt-3 text-[12.5px]">
        {t('posSource')}: {posSystemLabel(report.sourceSystem, t('posSourceOther'))} ·{' '}
        {formatPeriod(report.periodStart, report.periodEnd, locale)}
        {report.orderCount !== null && ` · ${t('posOrders', { count: report.orderCount })}`}
      </p>

      {shownTotals.length > 0 && (
        <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4">
          {shownTotals.map(([label, value]) => (
            <div key={label}>
              <dt className="text-muted-foreground text-[12.5px]">{label}</dt>
              <dd className="text-ink text-[19px] font-bold tabular-nums">{money(value)}</dd>
            </div>
          ))}
        </dl>
      )}

      <div className="mt-5">
        <AmountBars
          currency={report.currency}
          items={[
            { label: t('posNet'), cents: report.netSalesCents },
            { label: t('posTips'), cents: report.tipsCents },
            { label: t('posTaxCollected'), cents: report.taxCollectedCents },
            { label: t('posRefunds'), cents: report.refundsCents },
            { label: t('posDiscounts'), cents: report.discountsCents },
          ]}
        />
      </div>

      {report.tenders.length > 0 && (
        <div className="mt-6">
          <h3 className="text-muted-foreground text-[11px] font-semibold tracking-[0.12em] uppercase">
            {t('posTenders')}
          </h3>
          <ul className="border-line divide-line mt-2 divide-y rounded-xl border text-[14px]">
            {report.tenders.map((tender) => (
              <li key={tender.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <span className="text-ink">{tender.label}</span>
                <span className="text-muted-foreground tabular-nums">{money(tender.amountCents)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
