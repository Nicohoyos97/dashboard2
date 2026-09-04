'use client';

// Income tax across tax years: two columns per year — what the return projects
// against what has been paid — and a line for the liability still outstanding.
// One picture answers both questions an owner has: did we set enough aside,
// and where does it stand now.
//
// A year that prints no figure is left out by the caller rather than drawn at
// zero: a zero column reads as "nothing owed", which is a different claim from
// "not stated" (spec §3).
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

import { CATEGORICAL, CHART_CHROME, SERIES } from '@/lib/charts/palette';

import { ChartTooltip } from './ChartTooltip';
import { compactMoney } from './format';

// The liability line: a third hue from the categorical set, kept away from the
// status colours, which are reserved for status.
const LIABILITY = CATEGORICAL[3];

export type TaxYearChartPoint = {
  year: number;
  projectedCents: number | null;
  paidCents: number | null;
  remainingCents: number | null;
};

export function TaxYearChart({
  points,
  currency,
  summary,
}: {
  points: TaxYearChartPoint[];
  currency: string;
  summary: string;
}) {
  const locale = useLocale();
  const t = useTranslations('Taxes');
  const data = points.map((point) => ({
    label: String(point.year),
    projected: point.projectedCents,
    paid: point.paidCents,
    remaining: point.remainingCents,
  }));

  return (
    <figure>
      <ul className="text-muted-foreground mb-2 flex flex-wrap items-center gap-4 text-[12.5px]">
        <li className="flex items-center gap-2">
          <span
            className="size-2.5 rounded-full"
            style={{ background: SERIES.primary }}
            aria-hidden="true"
          />
          {t('chartProjected')}
        </li>
        <li className="flex items-center gap-2">
          <span
            className="size-2.5 rounded-full"
            style={{ background: SERIES.secondary }}
            aria-hidden="true"
          />
          {t('chartPaid')}
        </li>
        <li className="flex items-center gap-2">
          <span
            className="h-0.5 w-4 rounded-full"
            style={{ background: LIABILITY }}
            aria-hidden="true"
          />
          {t('chartRemaining')}
        </li>
      </ul>
      <div aria-hidden="true" className="h-[260px] w-full">
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
      </div>
      {/* Every chart ships a text equivalent (§1). */}
      <figcaption className="sr-only">{summary}</figcaption>
    </figure>
  );
}
