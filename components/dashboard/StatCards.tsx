import { getTranslations } from 'next-intl/server';

import { Sparkline } from '@/components/charts/Sparkline';

import { DeltaPill, deltaTone } from './DeltaPill';

export type StatTone = 'positive' | 'negative' | 'neutral' | 'warning';

export type StatCardItem = {
  label: string;
  /** Already formatted for the locale; null renders `unavailable` instead — never a zero standing in for "unknown". */
  value: string | null;
  unavailable?: string;
  /** Secondary line under the value: a vendor name, a due date, a jurisdiction. */
  detail?: string;
  deltaPct?: number | null;
  deltaLabel?: string;
  upIsGood?: boolean;
  trend?: readonly number[];
  badge?: { text: string; tone: StatTone };
};

const BADGE: Record<StatTone, string> = {
  positive: 'bg-success/10 text-success',
  negative: 'bg-danger/10 text-danger',
  warning: 'bg-warning/10 text-warning',
  neutral: 'bg-secondary text-muted-foreground',
};

/**
 * The portal's compact figure card, shared by Expenses and the tax pages so a
 * number looks the same wherever it appears. Direction is contextual
 * (`upIsGood`) and never carried by color alone — the arrow and the sign say it
 * too. A card with no delta says so rather than showing 0%.
 */
export async function StatCards({ items, columns = 4 }: { items: readonly StatCardItem[]; columns?: 3 | 4 }) {
  const t = await getTranslations('Overview');
  const grid = columns === 3 ? 'sm:grid-cols-2 lg:grid-cols-3' : 'sm:grid-cols-2 xl:grid-cols-4';

  return (
    <div className={`grid grid-cols-1 gap-3 ${grid}`}>
      {items.map((item) => {
        const delta = item.deltaPct ?? null;
        const upIsGood = item.upIsGood ?? true;
        // The change as it will be read, so a figure that prints as 0.0% is flat.
        const change = delta === null ? null : Number(delta.toFixed(1));
        // A trend is drawn only on a card that is a series; a due date or a
        // jurisdiction gets no dashed "no history yet" rule it never needed.
        const hasTrend = item.trend !== undefined;

        return (
          <article key={item.label} className="border-line bg-card flex flex-col overflow-hidden rounded-2xl border p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <div className="flex items-start justify-between gap-2">
              <p className="text-muted-foreground text-[12.5px] font-medium">{item.label}</p>
              {/* A card with no figure has nothing to qualify: a delta next to
                  "not available" would read as if the value existed. */}
              {item.value !== null && change !== null && delta !== null && (
                <DeltaPill change={change} magnitude={`${Math.abs(delta).toFixed(1)}%`} upIsGood={upIsGood} />
              )}
            </div>
            {item.value === null ? (
              <p className="text-muted-foreground mt-1.5 text-[13px] leading-snug">{item.unavailable ?? t('noDataPeriod')}</p>
            ) : (
              <p className="text-ink mt-1 text-[22px] leading-tight font-bold tracking-[-0.02em] tabular-nums">{item.value}</p>
            )}
            {item.detail && <p className="text-muted-foreground mt-1.5 truncate text-[12.5px]">{item.detail}</p>}
            {item.value !== null && (item.badge || (delta !== null && item.deltaLabel) || hasTrend) && (
              <div className="mt-auto flex items-end justify-between gap-2 pt-2">
                <div className="min-w-0 pb-0.5">
                  {item.badge && (
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[12px] font-semibold ${BADGE[item.badge.tone]}`}>{item.badge.text}</span>
                  )}
                  {delta !== null && item.deltaLabel && (
                    <p className={`text-muted-foreground truncate text-[11.5px] ${item.badge ? 'mt-1.5' : ''}`}>{item.deltaLabel}</p>
                  )}
                </div>
                {hasTrend && (
                  // Bleeds into the card's corner; the card's overflow-hidden clips it.
                  <div className="-mr-4 -mb-4 shrink-0">
                    <Sparkline values={item.trend ?? []} tone={deltaTone(change, upIsGood)} width={80} height={30} />
                  </div>
                )}
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}
