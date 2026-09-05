'use client';

// The Recharts drawing for MonthlySpendChart; the figure and its caption stay
// in the wrapper so the screen-reader reading never waits on the chart bundle.
import { useLocale } from 'next-intl';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { CHART_CHROME, SERIES } from '@/lib/charts/palette';

import { ChartTooltip } from '../ChartTooltip';
import { compactMoney, moneyAxisWidth, monthLabel } from '../format';

export type SpendMonth = { month: string; cents: number };

export function MonthlySpendPlot({
  months,
  currency,
  seriesLabel,
}: {
  months: SpendMonth[];
  currency: string;
  seriesLabel: string;
}) {
  const locale = useLocale();
  const data = months.map((m) => ({ label: monthLabel(m.month, locale), spend: m.cents }));

  return (
    <ResponsiveContainer width="100%" height="100%" minWidth={0}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} accessibilityLayer>
        <CartesianGrid vertical={false} stroke={CHART_CHROME.grid} strokeWidth={1} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: CHART_CHROME.axis, fontSize: 12 }} />
        {/* Sized from the ticks it will actually draw — see moneyAxisWidth:
            Spanish spells "60 mil US$" where English fits "$60K". */}
        <YAxis
          tickLine={false}
          axisLine={false}
          width={moneyAxisWidth(months.map((m) => m.cents), currency, locale)}
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
              rows={(payload ?? []).map((p) => ({ name: String(p.name), value: Number(p.value), color: String(p.color ?? SERIES.expense) }))}
            />
          )}
        />
        <Bar dataKey="spend" name={seriesLabel} fill={SERIES.expense} radius={[4, 4, 0, 0]} maxBarSize={28} />
      </BarChart>
    </ResponsiveContainer>
  );
}
