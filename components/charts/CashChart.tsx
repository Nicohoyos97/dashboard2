'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { CHART_CHROME, SERIES } from '@/lib/charts/palette';

import { ChartTooltip } from './ChartTooltip';
import { compactMoney, fullMoney, monthLabel } from './format';

export type CashMonth = { month: string; inCents: number; outCents: number; netCents: number };

// Cash In / Cash Out as thin columns with the Net line on the same axis
// (never a second y-axis). Ships a text summary for screen readers.
export function CashChart({ months, currency }: { months: CashMonth[]; currency: string }) {
  const t = useTranslations('Overview');
  const locale = useLocale();
  const data = months.map((m) => ({
    label: monthLabel(m.month, locale),
    in: m.inCents,
    out: m.outCents,
    net: m.netCents,
  }));
  const totalIn = months.reduce((s, m) => s + m.inCents, 0);
  const totalOut = months.reduce((s, m) => s + m.outCents, 0);
  const best = months.reduce((b, m) => (m.netCents > b.netCents ? m : b), months[0] ?? { month: '', inCents: 0, outCents: 0, netCents: 0 });

  return (
    <figure>
      <div className="h-[280px] w-full">
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barGap={2} accessibilityLayer>
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
              cursor={{ fill: 'rgba(37,99,235,0.06)' }}
              content={({ active, label, payload }) => (
                <ChartTooltip
                  active={active}
                  label={typeof label === 'string' ? label : undefined}
                  currency={currency}
                  locale={locale}
                  rows={(payload ?? []).map((p) => ({
                    name: String(p.name),
                    value: Number(p.value),
                    color: String(p.color ?? p.stroke ?? SERIES.net),
                  }))}
                />
              )}
            />
            <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12.5, color: CHART_CHROME.axis }} />
            <Bar dataKey="in" name={t('kpiCashIn')} fill={SERIES.cashIn} radius={[4, 4, 0, 0]} maxBarSize={24} />
            <Bar dataKey="out" name={t('kpiCashOut')} fill={SERIES.cashOut} radius={[4, 4, 0, 0]} maxBarSize={24} />
            <Line type="monotone" dataKey="net" name={t('kpiNetCash')} stroke={SERIES.net} strokeWidth={2} dot={{ r: 4, strokeWidth: 2, stroke: CHART_CHROME.surface, fill: SERIES.net }} activeDot={{ r: 5 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="text-muted-foreground mt-2 text-[12.5px]">
        {t('cashChartSummary', {
          months: months.length,
          totalIn: fullMoney(totalIn, currency, locale),
          totalOut: fullMoney(totalOut, currency, locale),
          bestMonth: best.month ? monthLabel(best.month, locale) : '—',
        })}
      </figcaption>
    </figure>
  );
}
