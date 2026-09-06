'use client';

import dynamic from 'next/dynamic';

import { REGISTER_SERIES } from '@/lib/charts/palette';

import { ChartSkeleton } from './ChartSkeleton';
import { fullMoney } from './format';
import type { NetSalesLabels, NetSalesPoint } from './plot/NetSalesPlot';

export type { NetSalesLabels, NetSalesPoint };

// What the client's register rang up over the published periods: three bars a
// period — net sales, and the tips and the tax it collected on top of them.
// All three come from the same point-of-sale report, so nothing is mixed across
// sources (§10) — and a tax filing's receipts, a different fact, are never
// plotted here.
//
// Only the drawing loads on demand; the legend and the caption that reads the
// figures out are rendered on the server, so neither waits on Recharts.
const NetSalesPlot = dynamic(() => import('./plot/NetSalesPlot').then((m) => m.NetSalesPlot), {
  ssr: false,
  loading: () => <ChartSkeleton />,
});

export function NetSalesChart({
  points,
  currency,
  labels,
  summary,
}: {
  points: NetSalesPoint[];
  currency: string;
  labels: NetSalesLabels;
  summary: string;
}) {
  // Only the series that are drawn (see NetSalesLabels).
  const legend: [string, string][] = [
    [labels.net, REGISTER_SERIES.net],
    ...(labels.tips ? ([[labels.tips, REGISTER_SERIES.tips]] as [string, string][]) : []),
    ...(labels.tax ? ([[labels.tax, REGISTER_SERIES.tax]] as [string, string][]) : []),
  ];

  // Fills the card it sits in: on the Sales Taxes page that card sits beside
  // the register breakdown, which is the taller of the two.
  return (
    <figure className="flex h-full flex-col">
      <ul className="text-muted-foreground mb-2 flex flex-wrap items-center gap-4 text-[12.5px]">
        {legend.map(([label, color]) => (
          <li key={label} className="flex items-center gap-2">
            <span className="size-2.5 rounded-full" style={{ background: color }} aria-hidden="true" />
            {label}
          </li>
        ))}
      </ul>
      <div className="min-h-[260px] w-full flex-1">
        <NetSalesPlot points={points} currency={currency} labels={labels} />
      </div>
      <figcaption className="text-muted-foreground mt-2 text-[12.5px]">
        {summary}
        <span className="sr-only">
          {' '}
          {points
            .map((point) => {
              const money = (cents: number | null | undefined) =>
                cents === null || cents === undefined ? '—' : fullMoney(cents, currency);
              const parts = [
                `${labels.net} ${money(point.netSalesCents)}`,
                ...(labels.tips ? [`${labels.tips} ${money(point.tipsCents)}`] : []),
                ...(labels.tax ? [`${labels.tax} ${money(point.taxCollectedCents)}`] : []),
              ];
              return `${point.label}: ${parts.join(', ')}`;
            })
            .join('. ')}
        </span>
      </figcaption>
    </figure>
  );
}
