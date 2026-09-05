'use client';

// The Recharts drawing for TaxYearChart; the legend and the text equivalent
// stay in the wrapper so neither waits on the chart bundle.
import { useLocale, useTranslations } from 'next-intl';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { CHART_CHROME, LIABILITY, SERIES } from '@/lib/charts/palette';

import { ChartTooltip } from '../ChartTooltip';
import { compactMoney } from '../format';

export type TaxYearChartPoint = {
  year: number;
  projectedCents: number | null;
  paidCents: number | null;
  remainingCents: number | null;
};

export function TaxYearPlot({ points, currency }: { points: TaxYearChartPoint[]; currency: string }) {
  const locale = useLocale();
  const t = useTranslations('Taxes');
  const data = points.map((point) => ({
    label: String(point.year),
    projected: point.projectedCents,
    paid: point.paidCents,
    remaining: point.remainingCents,
  }));

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} stroke={CHART_CHROME.grid} />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tick={{ fill: CHART_CHROME.axis, fontSize: 12 }}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={64}
          tick={{ fill: CHART_CHROME.axis, fontSize: 12 }}
          tickFormatter={(value: number) => compactMoney(value, currency, locale)}
        />
        <Tooltip
          cursor={{ fill: 'var(--chart-cursor)' }}
          content={({ active, label, payload }) => (
            <ChartTooltip
              active={active}
              label={typeof label === 'string' ? label : undefined}
              currency={currency}
              locale={locale}
              rows={(payload ?? []).map((entry) => ({
                name: String(entry.name),
                value: Number(entry.value),
                color: String(entry.color ?? SERIES.primary),
              }))}
            />
          )}
        />
        <Bar dataKey="projected" name={t('chartProjected')} fill={SERIES.primary} radius={[4, 4, 0, 0]} maxBarSize={26} />
        <Bar dataKey="paid" name={t('chartPaid')} fill={SERIES.secondary} radius={[4, 4, 0, 0]} maxBarSize={26} />
        <Line
          type="monotone"
          dataKey="remaining"
          name={t('chartRemaining')}
          stroke={LIABILITY}
          strokeWidth={2}
          dot={{ r: 3, fill: LIABILITY }}
          // A year with no figure breaks the line rather than being joined
          // through, which would draw a trend that was never stated.
          connectNulls={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
