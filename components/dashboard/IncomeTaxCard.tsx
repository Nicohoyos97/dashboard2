import { Landmark } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';

import { TrendBars, type TrendPoint } from '@/components/charts/TrendBars';
import { Link } from '@/i18n/navigation';
import type { TaxObligation } from '@/lib/reports/taxes';
import { nextDueDate, remainingOwed, sumField } from '@/lib/reports/taxes';
import { formatIsoDate } from '@/lib/utils/dates';

/**
 * Projected income tax against what has been paid, by tax year (§7).
 * "Projected" is the firm's own `amount_estimated` (or the confirmed amount once
 * it exists), never a number we derive: the portal does not forecast tax. A year
 * printing neither figure is left out, and a missing series draws no bar rather
 * than a zero that would read as "nothing owed" or "nothing paid".
 */
export async function IncomeTaxCard({
  obligations,
  currency,
  today,
}: {
  obligations: readonly TaxObligation[];
  currency: string;
  today: string;
}) {
  const [t, tTax, locale] = await Promise.all([
    getTranslations('Overview'),
    getTranslations('Taxes'),
    getLocale(),
  ]);
  const money = (cents: number) => new Intl.NumberFormat(locale, { style: 'currency', currency }).format(cents / 100);

  const years = [...new Set(obligations.flatMap((o) => (o.taxYear === null ? [] : [o.taxYear])))].sort((a, b) => a - b);
  const latest = years[years.length - 1] ?? null;
  const current = latest === null ? obligations : obligations.filter((o) => o.taxYear === latest);
  const remaining = remainingOwed(current);
  const due = nextDueDate(current, today);
  const anyConfirmed = current.some((o) => o.status === 'firm_confirmed');

  const points: TrendPoint[] = years.flatMap((year) => {
    const rows = obligations.filter((o) => o.taxYear === year);
    const projected = sumField(rows, (o) => o.confirmedCents ?? o.estimatedCents);
    const paid = sumField(rows, (o) => o.paidCents);
    return projected === null && paid === null ? [] : [{ label: String(year), a: projected, b: paid }];
  });

  return (
    <section className="border-line bg-card flex flex-col rounded-2xl border p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      {/* The badge rides with the title rather than the far edge, so a narrow
          column never orphans it onto its own line below the lede. */}
      <h2 className="text-ink flex items-center gap-2 text-[16px] font-semibold">
        <Landmark className="text-blue size-[18px] shrink-0" aria-hidden="true" />
        <span className="min-w-0 truncate">{t('incomeTaxTitle')}</span>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[12px] font-semibold ${anyConfirmed ? 'bg-success/10 text-success' : 'bg-secondary text-muted-foreground'}`}>
          {anyConfirmed ? tTax('status_firm_confirmed') : tTax('status_estimated')}
        </span>
      </h2>
      <p className="text-muted-foreground mt-1 text-[13px] leading-[1.45]">
        {latest === null ? t('incomeTaxLede') : t('incomeTaxLedeYear', { year: latest })}
      </p>

      {points.length === 0 ? (
        <p className="text-muted-foreground mt-4 text-[14px]">{t('incomeTaxEmpty')}</p>
      ) : (
        <>
          <div className="mt-4">
            <TrendBars
              points={points}
              currency={currency}
              seriesA={t('incomeTaxProjected')}
              seriesB={t('incomeTaxPaid')}
              summary={t('incomeTaxSummary', { count: points.length })}
            />
          </div>
          <div className="border-line-soft mt-auto flex flex-wrap items-end justify-between gap-3 border-t pt-4">
            <div className="min-w-0">
              <p className="text-muted-foreground text-[12px] font-medium">{t('incomeTaxRemaining')}</p>
              <p className="text-ink mt-1 text-[20px] leading-none font-bold tabular-nums">
                {remaining === null ? tTax('notPrinted') : money(remaining.cents)}
              </p>
              <p className="text-muted-foreground mt-1.5 text-[11.5px]">
                {[remaining ? tTax(`basis_${remaining.basis}`) : null, due === null ? tTax('noUpcomingDue') : tTax('dueOn', { date: formatIsoDate(due, locale) })]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </div>
            <Link href="/taxes/income" className="text-blue text-[12.5px] font-semibold hover:underline">
              {t('viewDetail')}
            </Link>
          </div>
        </>
      )}
    </section>
  );
}
