'use client';

import dynamic from 'next/dynamic';

import { ChartSkeleton } from './ChartSkeleton';
import { fullMoney } from './format';
import type { NetSalesPoint } from './plot/NetSalesPlot';

export type { NetSalesPoint };

// Net sales across the client's published point-of-sale periods, drawn as the
// same soft area as the Overview's income chart — one series, because there is
// no second opinion on sales to plot beside it: the register is the only source
// of a sales figure in this portal (0022), and a tax filing's receipts are a
// different fact that is never read as sales.
//
// Only the drawing loads on demand; the caption that reads the figures out is
// rendered on the server, so it never waits on Recharts.
const NetSalesPlot = dynamic(() => import('./plot/NetSalesPlot').then((m) => m.NetSalesPlot), {
  ssr: false,
  loading: () => <ChartSkeleton />,
});

export function NetSalesChart({
  points,
  currency,
  seriesLabel,
  summary,
}: {
  points: NetSalesPoint[];
  currency: string;
  seriesLabel: string;
  summary: string;
}) {
  // Fills the card it sits in: on the Sales Taxes page that card sits beside
  // the register breakdown, which is the taller of the two.
  return (
    <figure className="flex h-full flex-col">
      <div className="min-h-[260px] w-full flex-1">
        <NetSalesPlot points={points} currency={currency} seriesLabel={seriesLabel} />
      </div>
      <figcaption className="text-muted-foreground mt-2 text-[12.5px]">
        {summary}
        <span className="sr-only">
          {' '}
          {points
            .map(
              (point) =>
                `${point.label}: ${point.netSalesCents === null ? '—' : fullMoney(point.netSalesCents, currency)}`,
            )
            .join('. ')}
        </span>
      </figcaption>
    </figure>
  );
}
