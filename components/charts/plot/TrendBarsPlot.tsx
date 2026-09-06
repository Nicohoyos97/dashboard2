'use client';

// The Recharts drawing for TrendBars. Split from the figure so it can be
// loaded on demand: Recharts is ~104 KB transferred and every chart route was
// paying it up front. The legend and the caption stay in the wrapper, which is
// server-rendered.
import {  } from 'next-intl';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { CHART_CHROME, SERIES } from '@/lib/charts/palette';

import { ChartTooltip } from '../ChartTooltip';
import { compactMoney, moneyAxisWidth } from '../format';

export type TrendPoint = { label: string; a: number | null; b: number | null };

export function TrendBarsPlot({
  points,
  currency,
  seriesA,
  seriesB,
}: {
  points: TrendPoint[];
  currency: string;
  seriesA: string;
  seriesB?: string;
}) {
  // Null stays null: a figure the statement does not print must not become a
  // zero bar, which would read as "nothing" rather than "not stated". Recharts
  // simply draws no bar for it.
  const data = points.map((p) => ({ label: p.label, a: p.a, b: p.b }));
  return (
    <ResponsiveContainer width="100%" height="100%" minWidth={0}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barGap={2} accessibilityLayer>
        <CartesianGrid vertical={false} stroke={CHART_CHROME.grid} strokeWidth={1} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: CHART_CHROME.axis, fontSize: 12 }} />
        {/* Sized from the ticks it will actually draw — see moneyAxisWidth:
            Spanish spells "60 mil US$" where English fits "$60K". */}
        <YAxis
          tickLine={false}
          axisLine={false}
          width={moneyAxisWidth(points.flatMap((p) => [p.a, p.b]), currency)}
          tick={{ fill: CHART_CHROME.axis, fontSize: 12 }}
          tickFormatter={(v: number) => compactMoney(v, currency)}
        />
        <Tooltip
          cursor={{ fill: 'var(--chart-cursor)' }}
          content={({ active, label, payload }) => (
            <ChartTooltip
              active={active}
              label={typeof label === 'string' ? label : undefined}
              currency={currency}
              rows={(payload ?? []).map((p) => ({ name: String(p.name), value: Number(p.value), color: String(p.color ?? SERIES.primary) }))}
            />
          )}
        />
        <Bar dataKey="a" name={seriesA} fill={SERIES.primary} radius={[4, 4, 0, 0]} maxBarSize={24} />
        {seriesB && <Bar dataKey="b" name={seriesB} fill={SERIES.secondary} radius={[4, 4, 0, 0]} maxBarSize={24} />}
      </BarChart>
    </ResponsiveContainer>
  );
}
