'use client';

// The Recharts drawing for NetSalesChart; the figure and its caption stay in
// the wrapper so the screen-reader reading never waits on the chart bundle.
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { SERIES } from '@/lib/charts/palette';

import { compactMoney, fullMoney, moneyAxisWidth } from '../format';

export type NetSalesPoint = { label: string; netSalesCents: number | null };

export function NetSalesPlot({
  points,
  currency,
  seriesLabel,
}: {
  points: NetSalesPoint[];
  currency: string;
  seriesLabel: string;
}) {
  const data = points.map((point) => ({ label: point.label, net: point.netSalesCents }));

  return (
    <ResponsiveContainer width="100%" height="100%" minWidth={0}>
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} accessibilityLayer>
        <defs>
          <linearGradient id="netSales-net" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={SERIES.income} stopOpacity={0.22} />
            <stop offset="100%" stopColor={SERIES.income} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="var(--chart-grid)" strokeWidth={1} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={10} tick={{ fill: 'var(--chart-axis)', fontSize: 12 }} />
        {/* Sized from the ticks it will actually draw — see moneyAxisWidth. */}
        <YAxis
          tickLine={false}
          axisLine={false}
          width={moneyAxisWidth(points.map((point) => point.netSalesCents), currency)}
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
        {/* A period whose report does not print net sales breaks the line
            rather than being joined across — connectNulls would draw a month
            that was never reported. */}
        <Area
          type="monotone"
          dataKey="net"
          name={seriesLabel}
          stroke={SERIES.income}
          strokeWidth={2.25}
          fill="url(#netSales-net)"
          dot={false}
          activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--chart-surface)' }}
          connectNulls={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
