'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { SERIES } from '@/lib/charts/palette';

import { compactMoney, fullMoney } from './format';

export type IncomeExpensePoint = { label: string; incomeCents: number | null; expenseCents: number | null };

// Income against expenses over the published Profit & Loss periods, drawn as
// two soft areas per the owner's reference (~/Desktop/mia.png): a dark line for
// income, a lighter one for expenses, gradient fills, horizontal grid only, and
// a solid tooltip card. Both series come from the same statement, so nothing is
// mixed across sources (spec §3). A period whose statement does not print a
// total is left out by the caller rather than plotted as zero.
export function IncomeExpenseChart({
  points,
  currency,
  summary,
}: {
  points: IncomeExpensePoint[];
  currency: string;
  summary: string;
}) {
  const t = useTranslations('Overview');
  const locale = useLocale();
  const data = points.map((point) => ({
    label: point.label,
    income: point.incomeCents,
    expense: point.expenseCents,
  }));

  return (
    <figure>
      <div className="h-[260px] w-full">
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} accessibilityLayer>
            <defs>
              <linearGradient id="incomeExpense-income" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={SERIES.income} stopOpacity={0.22} />
                <stop offset="100%" stopColor={SERIES.income} stopOpacity={0} />
              </linearGradient>
              <linearGradient id="incomeExpense-expense" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={SERIES.expense} stopOpacity={0.2} />
                <stop offset="100%" stopColor={SERIES.expense} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="var(--chart-grid)" strokeWidth={1} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={10} tick={{ fill: 'var(--chart-axis)', fontSize: 12 }} />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={64}
              tick={{ fill: 'var(--chart-axis)', fontSize: 12 }}
              tickFormatter={(value: number) => compactMoney(value, currency, locale)}
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
                          {fullMoney(Number(entry.value), currency, locale)}
                        </span>
                      </p>
                    ))}
                    {typeof label === 'string' && <p className="mt-1.5 text-[11.5px] text-white/70">{label}</p>}
                  </div>
                );
              }}
            />
            <Area
              type="monotone"
              dataKey="income"
              name={t('seriesIncome')}
              stroke={SERIES.income}
              strokeWidth={2.25}
              fill="url(#incomeExpense-income)"
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--chart-surface)' }}
              connectNulls={false}
            />
            <Area
              type="monotone"
              dataKey="expense"
              name={t('seriesExpense')}
              stroke={SERIES.expense}
              strokeWidth={2.25}
              fill="url(#incomeExpense-expense)"
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--chart-surface)' }}
              connectNulls={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="text-muted-foreground mt-2 text-[12.5px]">
        {summary}
        <span className="sr-only">
          {' '}
          {points
            .map(
              (point) =>
                `${point.label}: ${t('seriesIncome')} ${point.incomeCents === null ? '—' : fullMoney(point.incomeCents, currency, locale)}, ${t('seriesExpense')} ${point.expenseCents === null ? '—' : fullMoney(point.expenseCents, currency, locale)}`,
            )
            .join('. ')}
        </span>
      </figcaption>
    </figure>
  );
}
