import { getTranslations } from 'next-intl/server';

import { Sparkline } from '@/components/charts/Sparkline';
import { DeltaPill, deltaTone } from '@/components/dashboard/DeltaPill';
import type { Metric, MetricReason, Ratio } from '@/lib/reports/types';
import { formatCents } from '@/lib/money';

/**
 * `trend` is the figure across the published periods, oldest first — real
 * totals only. A card that is given one draws it the way the Overview's KPI
 * cards do; a card that is not a series (no `trend`) draws nothing.
 */
export type MetricCardItem =
  | { kind: 'money'; label: string; metric: Metric; upIsGood: boolean; trend?: readonly number[] }
  | { kind: 'ratio'; label: string; ratio: Ratio; upIsGood: boolean; format: 'pct' | 'x'; trend?: readonly number[] };

type Resolved = {
  item: MetricCardItem;
  value: string | null;
  reason: string;
  change: number | null;
  magnitude: string | null;
  print: (v: number) => string;
};

// Headline figures for a statement (§7 P&L / Balance Sheet cards). The four
// totals the owner reads first are cards; the ratios and the cost line that
// explain them sit in one strip underneath, so the page opens on four numbers
// rather than seven boxes of equal weight. A figure the statement does not
// print is shown as "not printed" with the reason — never estimated. Deltas
// are contextual (upIsGood) and carry a sign + arrow.
export async function MetricCards({
  items,
  secondary = [],
  secondaryLabel,
  currency,
}: {
  items: MetricCardItem[];
  secondary?: MetricCardItem[];
  /** Names the strip for assistive tech. */
  secondaryLabel?: string;
  currency: string;
}) {
  const [t, tOverview] = await Promise.all([getTranslations('Statements'), getTranslations('Overview')]);
  const money = (cents: number) => formatCents(cents, currency);
  const reasonText = (reason: MetricReason | undefined) =>
    reason === 'no_printed_total' ? t('notPrinted') : reason ? t(`reason_${reason}`) : t('notCalculable');

  const resolve = (item: MetricCardItem): Resolved => {
    const current = item.kind === 'money' ? item.metric.current?.cents ?? null : item.ratio.current;
    const prior = item.kind === 'money' ? item.metric.prior?.cents ?? null : item.ratio.prior;
    const reason = item.kind === 'money' ? item.metric.reason : item.ratio.reason;
    const delta = current !== null && prior !== null ? current - prior : null;
    const deltaPct = item.kind === 'money' ? item.metric.deltaPct : null;
    const print = (v: number) =>
      item.kind === 'money' ? money(v) : item.format === 'pct' ? `${v.toFixed(1)}%` : `${v.toFixed(2)}×`;
    // The change as it will be read — rounded the way it prints — and its
    // unsigned size; the pill adds the sign and the arrow.
    const digits = item.kind === 'ratio' && item.format === 'x' ? 2 : 1;
    const change =
      delta === null
        ? null
        : item.kind === 'money'
          ? deltaPct !== null
            ? Number(deltaPct.toFixed(1))
            : delta
          : Number(delta.toFixed(digits));
    const magnitude =
      delta === null
        ? null
        : item.kind === 'money'
          ? deltaPct !== null
            ? `${Math.abs(deltaPct).toFixed(1)}%`
            : money(Math.abs(delta))
          : `${Math.abs(delta).toFixed(digits)}${item.format === 'pct' ? ' pts' : ''}`;
    return {
      item,
      value: current === null ? null : print(current),
      reason: change === null && reason ? reasonText(reason) : change === null ? t('noPriorShort') : '',
      change,
      magnitude,
      print,
    };
  };

  return (
    <div>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {items.map(resolve).map(({ item, value, reason, change, magnitude, print }) => {
          const pill =
            value !== null && change !== null && magnitude !== null ? (
              <DeltaPill change={change} magnitude={magnitude} upIsGood={item.upIsGood} />
            ) : null;
          const trend = item.trend;
          return (
            <article key={item.label} className="border-line bg-card relative flex flex-col overflow-hidden rounded-2xl border p-4 shadow-card sm:p-5">
              <p className="text-muted-foreground text-small leading-snug font-medium">{item.label}</p>
              {value === null ? (
                <p className="text-muted-foreground mt-1.5 text-small leading-snug">{reasonText(item.kind === 'money' ? item.metric.reason : item.ratio.reason)}</p>
              ) : (
                <div className="mt-auto pt-1">
                  <p className="text-ink text-stat leading-tight font-bold tracking-[-0.02em] tabular-nums sm:text-display">{value}</p>
                  <div className="mt-2 flex items-end justify-between gap-2">
                    <div className="min-w-0 pb-0.5">
                      {pill ?? <p className="text-muted-foreground text-caption">{reason}</p>}
                    </div>
                    {trend !== undefined && (
                      <>
                        {/* Bleeds into the card's corner; the card's overflow-hidden clips it. */}
                        <div className="-mr-5 -mb-5 shrink-0 max-sm:hidden">
                          <Sparkline values={trend} tone={deltaTone(change, item.upIsGood)} />
                        </div>
                        {/* The sparkline is aria-hidden; this is its text equivalent. */}
                        {trend.length >= 2 && (
                          <span className="sr-only">
                            {tOverview('trendSummary', { count: trend.length, first: print(trend[0] ?? 0), last: print(trend[trend.length - 1] ?? 0) })}
                          </span>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </div>

      {secondary.length > 0 && (
        <dl
          aria-label={secondaryLabel}
          className={`border-line bg-card divide-line mt-3 grid grid-cols-1 divide-y rounded-2xl border shadow-card sm:divide-x sm:divide-y-0 ${
            secondary.length >= 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2'
          }`}
        >
          {secondary.map(resolve).map(({ item, value, reason, change, magnitude }) => (
            <div key={item.label} className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
              <dt className="text-muted-foreground min-w-0 text-small font-medium">{item.label}</dt>
              <dd className="flex shrink-0 items-center gap-2">
                {value === null ? (
                  <span className="text-muted-foreground text-small">{reasonText(item.kind === 'money' ? item.metric.reason : item.ratio.reason)}</span>
                ) : (
                  <>
                    <span className="text-ink text-title font-semibold tabular-nums">{value}</span>
                    {change !== null && magnitude !== null ? (
                      <DeltaPill change={change} magnitude={magnitude} upIsGood={item.upIsGood} />
                    ) : (
                      reason && <span className="text-muted-foreground text-caption">{reason}</span>
                    )}
                  </>
                )}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
