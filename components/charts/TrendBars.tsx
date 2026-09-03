'use client';

import { useLocale } from 'next-intl';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { CHART_CHROME, SERIES } from '@/lib/charts/palette';

import { ChartTooltip } from './ChartTooltip';
import { compactMoney } from './format';

export type TrendPoint = { label: string; a: number | null; b: number | null };

// Two measures across periods (revenue vs expenses, assets vs liabilities):
// grouped thin columns on one axis, fixed colors (a = blue, b = teal).
export function TrendBars({ points, currency, seriesA, seriesB, summary }: { points: TrendPoint[]; currency: string; seriesA: string; seriesB: string; summary: string }) {
  const locale = useLocale();
  // Null stays null: a figure the statement does not print must not become a
  // zero bar, which would read as "nothing" rather than "not stated". Recharts
  // simply draws no bar for it.
  const data = points.map((p) => ({ label: p.label, a: p.a, b: p.b }));
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
        <li className="flex items-center gap-2">
          <span className="size-2.5 rounded-full" style={{ background: SERIES.secondary }} aria-hidden="true" />
          {seriesB}
        </li>
      </ul>
      <div className="h-[240px] w-full">
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barGap={2} accessibilityLayer>
            <CartesianGrid vertical={false} stroke={CHART_CHROME.grid} strokeWidth={1} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: CHART_CHROME.axis, fontSize: 12 }} />
            <YAxis tickLine={false} axisLine={false} width={64} tick={{ fill: CHART_CHROME.axis, fontSize: 12 }} tickFormatter={(v: number) => compactMoney(v, currency, locale)} />
            <Tooltip
              cursor={{ fill: 'var(--chart-cursor)' }}
              content={({ active, label, payload }) => (
                <ChartTooltip
                  active={active}
                  label={typeof label === 'string' ? label : undefined}
                  currency={currency}
                  locale={locale}
                  rows={(payload ?? []).map((p) => ({ name: String(p.name), value: Number(p.value), color: String(p.color ?? SERIES.primary) }))}
                />
              )}
            />
            <Bar dataKey="a" name={seriesA} fill={SERIES.primary} radius={[4, 4, 0, 0]} maxBarSize={24} />
            <Bar dataKey="b" name={seriesB} fill={SERIES.secondary} radius={[4, 4, 0, 0]} maxBarSize={24} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="text-muted-foreground mt-2 text-[12.5px]">{summary}</figcaption>
    </figure>
  );
}
