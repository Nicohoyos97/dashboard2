'use client';

import { useLocale } from 'next-intl';
import dynamic from 'next/dynamic';

import { ChartSkeleton } from './ChartSkeleton';
import { fullMoney, monthLabel } from './format';
import type { SpendMonth } from './plot/MonthlySpendPlot';

export type { SpendMonth };

// One measure over months: thin columns on a single axis, in the same amber the
// Overview uses for expenses so spend reads the same across the portal. Ships a
// text summary for screen readers (§1 charts) — rendered here, on the server,
// rather than inside the lazily loaded plot.
const MonthlySpendPlot = dynamic(() => import('./plot/MonthlySpendPlot').then((m) => m.MonthlySpendPlot), {
  ssr: false,
  loading: () => <ChartSkeleton />,
});

export function MonthlySpendChart({
  months,
  currency,
  seriesLabel,
  summary,
}: {
  months: SpendMonth[];
  currency: string;
  seriesLabel: string;
  summary: string;
}) {
  const locale = useLocale();

  return (
    <figure>
      <div className="h-[240px] w-full">
        <MonthlySpendPlot months={months} currency={currency} seriesLabel={seriesLabel} />
      </div>
      <figcaption className="text-muted-foreground mt-2 text-[12.5px]">
        {summary}
        <span className="sr-only">
          {' '}
          {months.map((m) => `${monthLabel(m.month, locale)}: ${fullMoney(m.cents, currency)}`).join('. ')}
        </span>
      </figcaption>
    </figure>
  );
}
