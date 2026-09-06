'use client';

// The Recharts drawing for NetSalesChart; the figure, its legend and its
// caption stay in the wrapper so the screen-reader reading never waits on the
// chart bundle.
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { REGISTER_SERIES } from '@/lib/charts/palette';

import { ChartTooltip } from '../ChartTooltip';
import { compactMoney, moneyAxisWidth } from '../format';

export type NetSalesPoint = {
  label: string;
  netSalesCents: number | null;
  tipsCents?: number | null;
  taxCollectedCents?: number | null;
};

/**
 * Tips and tax are drawn only when they are named, the way TrendBars treats its
 * second series: a caller with nothing to say about them (the Overview's
 * net-sales card) neither passes a label nor gets a bar.
 */
export type NetSalesLabels = { net: string; tips?: string; tax?: string };

export function NetSalesPlot({
  points,
  currency,
  labels,
}: {
  points: NetSalesPoint[];
  currency: string;
  labels: NetSalesLabels;
}) {
  const data = points.map((point) => ({
    label: point.label,
    net: point.netSalesCents,
    tips: point.tipsCents ?? null,
    tax: point.taxCollectedCents ?? null,
  }));

  return (
    <ResponsiveContainer width="100%" height="100%" minWidth={0}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barGap={2} accessibilityLayer>
        <CartesianGrid vertical={false} stroke="var(--chart-grid)" strokeWidth={1} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={10} tick={{ fill: 'var(--chart-axis)', fontSize: 12 }} />
        {/* Sized from the ticks it will actually draw — see moneyAxisWidth. */}
        <YAxis
          tickLine={false}
          axisLine={false}
          width={moneyAxisWidth(
            points.flatMap((point) => [point.netSalesCents, point.tipsCents ?? null, point.taxCollectedCents ?? null]),
            currency,
          )}
          tick={{ fill: 'var(--chart-axis)', fontSize: 12 }}
          tickFormatter={(value: number) => compactMoney(value, currency)}
        />
        <Tooltip
          cursor={{ fill: 'var(--chart-cursor)' }}
          content={({ active, label, payload }) => (
            <ChartTooltip
              active={active}
              label={typeof label === 'string' ? label : undefined}
              currency={currency}
              rows={(payload ?? [])
                .filter((entry) => typeof entry.value === 'number')
                .map((entry) => ({
                  name: String(entry.name),
                  value: Number(entry.value),
                  color: String(entry.color ?? REGISTER_SERIES.net),
                }))}
            />
          )}
        />
        {/* Three bars per period, all three from the same point-of-sale report:
            what was sold, and the two amounts the register held on top of it.
            Tips and tax are an order of magnitude smaller than net sales and
            read as short bars beside it — the tooltip carries the exact
            figures, which a shared axis is what makes comparable in the first
            place. A period whose report does not print one leaves a gap rather
            than a zero bar: Recharts draws nothing for a null, and "not
            printed" is not "nothing". */}
        <Bar dataKey="net" name={labels.net} fill={REGISTER_SERIES.net} radius={[4, 4, 0, 0]} maxBarSize={28} />
        {labels.tips && (
          <Bar dataKey="tips" name={labels.tips} fill={REGISTER_SERIES.tips} radius={[4, 4, 0, 0]} maxBarSize={28} />
        )}
        {labels.tax && (
          <Bar dataKey="tax" name={labels.tax} fill={REGISTER_SERIES.tax} radius={[4, 4, 0, 0]} maxBarSize={28} />
        )}
      </BarChart>
    </ResponsiveContainer>
  );
}
