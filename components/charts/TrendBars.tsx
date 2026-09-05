'use client';

import dynamic from 'next/dynamic';

import { SERIES } from '@/lib/charts/palette';

import { ChartSkeleton } from './ChartSkeleton';
import type { TrendPoint } from './plot/TrendBarsPlot';

export type { TrendPoint };

// Two measures across periods (revenue vs expenses, assets vs liabilities):
// grouped thin columns on one axis, fixed colors (a = blue, b = teal).
// `seriesB` is optional: a caller whose source never prints the second figure
// omits it, and neither a swatch nor a column is drawn for it.
//
// Only the plot is loaded on demand — the legend and the caption are rendered
// on the server, so the reading a screen reader gets never waits on Recharts,
// and the fixed-height box below is unchanged whether the skeleton or the chart
// is inside it.
const TrendBarsPlot = dynamic(() => import('./plot/TrendBarsPlot').then((m) => m.TrendBarsPlot), {
  ssr: false,
  loading: () => <ChartSkeleton />,
});

export function TrendBars({ points, currency, seriesA, seriesB, summary }: { points: TrendPoint[]; currency: string; seriesA: string; seriesB?: string; summary: string }) {
  return (
    <figure>
      {/* Our own legend rather than Recharts': its order follows whichever
          series first has a value, which can put the first swatch out of step
          with the first column. */}
      <ul className="text-muted-foreground mb-2 flex flex-wrap items-center gap-4 text-[12.5px]">
        <li className="flex items-center gap-2">
          <span className="size-2.5 rounded-full" style={{ background: SERIES.primary }} aria-hidden="true" />
          {seriesA}
        </li>
        {seriesB && (
          <li className="flex items-center gap-2">
            <span className="size-2.5 rounded-full" style={{ background: SERIES.secondary }} aria-hidden="true" />
            {seriesB}
          </li>
        )}
      </ul>
      <div className="h-[240px] w-full">
        <TrendBarsPlot points={points} currency={currency} seriesA={seriesA} {...(seriesB ? { seriesB } : {})} />
      </div>
      <figcaption className="text-muted-foreground mt-2 text-[12.5px]">{summary}</figcaption>
    </figure>
  );
}
