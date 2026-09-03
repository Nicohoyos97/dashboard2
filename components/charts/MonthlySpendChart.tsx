'use client';

import { useLocale } from 'next-intl';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { CHART_CHROME, SERIES } from '@/lib/charts/palette';

import { ChartTooltip } from './ChartTooltip';
import { compactMoney, fullMoney, monthLabel } from './format';

export type SpendMonth = { month: string; cents: number };

// One measure over months: thin columns on a single axis. Amber is the
// money-out hue used by the Overview cash chart, so "spend" reads the same
// across the portal. Ships a text summary for screen readers (§1 charts).
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
  const data = months.map((m) => ({ label: monthLabel(m.month, locale), spend: m.cents }));

  return (
    <figure>
      <div className="h-[240px] w-full">
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} accessibilityLayer>
            <CartesianGrid vertical={false} stroke={CHART_CHROME.grid} strokeWidth={1} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: CHART_CHROME.axis, fontSize: 12 }} />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={64}
              tick={{ fill: CHART_CHROME.axis, fontSize: 12 }}
              tickFormatter={(v: number) => compactMoney(v, currency, locale)}
            />
            <Tooltip
              cursor={{ fill: 'var(--chart-cursor)' }}
              content={({ active, label, payload }) => (
                <ChartTooltip
                  active={active}
                  label={typeof label === 'string' ? label : undefined}
                  currency={currency}
                  locale={locale}
                  rows={(payload ?? []).map((p) => ({ name: String(p.name), value: Number(p.value), color: String(p.color ?? SERIES.cashOut) }))}
                />
              )}
            />
            <Bar dataKey="spend" name={seriesLabel} fill={SERIES.cashOut} radius={[4, 4, 0, 0]} maxBarSize={28} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="text-muted-foreground mt-2 text-[12.5px]">
        {summary}
        <span className="sr-only">
          {' '}
          {months.map((m) => `${monthLabel(m.month, locale)}: ${fullMoney(m.cents, currency, locale)}`).join('. ')}
        </span>
      </figcaption>
    </figure>
  );
}
