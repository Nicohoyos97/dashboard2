'use client';

import { useLocale, useTranslations } from 'next-intl';
import dynamic from 'next/dynamic';

import { ChartSkeleton } from './ChartSkeleton';
import { fullMoney } from './format';
import type { IncomeExpensePoint } from './plot/IncomeExpensePlot';

export type { IncomeExpensePoint };

// Income against expenses over the published Profit & Loss periods, drawn as
// two soft areas per the owner's reference (~/Desktop/mia.png): a dark line for
// income, a lighter one for expenses, gradient fills, horizontal grid only, and
// a solid tooltip card. Both series come from the same statement, so nothing is
// mixed across sources (spec §3). A period whose statement does not print a
// total is left out by the caller rather than plotted as zero.
//
// The drawing loads on demand; the caption that reads the figures out is
// rendered on the server, so it never waits on Recharts.
const IncomeExpensePlot = dynamic(() => import('./plot/IncomeExpensePlot').then((m) => m.IncomeExpensePlot), {
  ssr: false,
  loading: () => <ChartSkeleton />,
});

export function IncomeExpenseChart({
  points,
  currency,
  summary,
}: {
  points: IncomeExpensePoint[];
  currency: string;
  summary: string;
}) {
  const t = useTranslations('Overview');
  const locale = useLocale();

  return (
    <figure>
      <div className="h-[260px] w-full">
        <IncomeExpensePlot points={points} currency={currency} />
      </div>
      <figcaption className="text-muted-foreground mt-2 text-[12.5px]">
        {summary}
        <span className="sr-only">
          {' '}
          {points
            .map(
              (point) =>
                `${point.label}: ${t('seriesIncome')} ${point.incomeCents === null ? '—' : fullMoney(point.incomeCents, currency, locale)}, ${t('seriesExpense')} ${point.expenseCents === null ? '—' : fullMoney(point.expenseCents, currency, locale)}`,
            )
            .join('. ')}
        </span>
      </figcaption>
    </figure>
  );
}
