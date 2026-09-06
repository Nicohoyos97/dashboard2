'use client';

// The Recharts drawing for NetSalesChart; the figure, its legend and its
// caption stay in the wrapper so the screen-reader reading never waits on the
// chart bundle.
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { REGISTER_SERIES } from '@/lib/charts/palette';

import { compactMoney, fullMoney, moneyAxisWidth } from '../format';

export type NetSalesPoint = {
  label: string;
  netSalesCents: number | null;
  tipsCents?: number | null;
  taxCollectedCents?: number | null;
};

/**
 * Tips and tax are drawn only when they are named, the way TrendBars treats its
 * second series: a caller with nothing to say about them (the Overview's
 * net-sales card) neither passes a label nor gets a line.
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
      <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} accessibilityLayer>
        <defs>
          <linearGradient id="netSales-net" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={REGISTER_SERIES.net} stopOpacity={0.22} />
            <stop offset="100%" stopColor={REGISTER_SERIES.net} stopOpacity={0} />
          </linearGradient>
        </defs>
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
          cursor={{ stroke: 'var(--chart-axis)', strokeWidth: 1, strokeDasharray: '4 4' }}
          content={({ active, label, payload }) => {
            const rows = (payload ?? []).filter((entry) => typeof entry.value === 'number');
            if (!active || rows.length === 0) return null;
            return (
              <div className="rounded-xl bg-[var(--chart-tooltip-bg)] px-3.5 py-2.5 text-white shadow-[0_10px_28px_rgba(15,23,42,0.24)]">
                {rows.map((entry) => (
                  <p key={String(entry.name)} className="not-first:mt-2">
                    <span className="block text-[11.5px] text-white/70">{String(entry.name)}</span>
                    <span className="block text-[18px] leading-tight font-bold tabular-nums">
                      {fullMoney(Number(entry.value), currency)}
                    </span>
                  </p>
                ))}
                {typeof label === 'string' && <p className="mt-1.5 text-[11.5px] text-white/70">{label}</p>}
              </div>
            );
          }}
        />
        {/* Net sales carries the fill; tips and tax are plain lines beside it,
            two figures an order of magnitude smaller that would be lost under
            areas of their own. A period whose report does not print one breaks
            that line rather than being joined across — connectNulls would draw
            a month that was never reported. */}
        <Area
          type="monotone"
          dataKey="net"
          name={labels.net}
          stroke={REGISTER_SERIES.net}
          strokeWidth={2.25}
          fill="url(#netSales-net)"
          dot={false}
          activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--chart-surface)' }}
          connectNulls={false}
        />
        {labels.tips && (
        <Line
          type="monotone"
          dataKey="tips"
          name={labels.tips}
          stroke={REGISTER_SERIES.tips}
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--chart-surface)' }}
          connectNulls={false}
        />
        )}
        {labels.tax && (
        <Line
          type="monotone"
          dataKey="tax"
          name={labels.tax}
          stroke={REGISTER_SERIES.tax}
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--chart-surface)' }}
          connectNulls={false}
        />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  );
}
