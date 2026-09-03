import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

import { Sparkline, type SparklineTone } from '@/components/charts/Sparkline';

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
    <div className={`grid gap-3 ${grid}`}>
      {items.map((item) => {
        const delta = item.deltaPct ?? null;
        const up = delta !== null && delta > 0;
        const down = delta !== null && delta < 0;
        const upIsGood = item.upIsGood ?? true;
        const good = (up && upIsGood) || (down && !upIsGood);
        const bad = (up && !upIsGood) || (down && upIsGood);
        const tone: SparklineTone = good ? 'positive' : bad ? 'negative' : 'neutral';
        const pill = good ? BADGE.positive : bad ? BADGE.negative : BADGE.neutral;

        return (
          <article key={item.label} className="border-line bg-card flex flex-col rounded-2xl border p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <p className="text-muted-foreground text-[12.5px] font-medium">{item.label}</p>
            {item.value === null ? (
              <p className="text-muted-foreground mt-1.5 text-[13px] leading-snug">{item.unavailable ?? t('noDataPeriod')}</p>
            ) : (
              <p className="text-ink mt-1.5 text-[22px] leading-none font-bold tracking-[-0.02em] tabular-nums">{item.value}</p>
            )}
            {item.detail && <p className="text-muted-foreground mt-1.5 truncate text-[12.5px]">{item.detail}</p>}
            {(delta !== null || item.badge || (item.trend?.length ?? 0) >= 2) && (
              <div className="mt-auto flex items-end justify-between gap-3 pt-3">
                <div className="min-w-0">
                  {item.badge && (
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[12px] font-semibold ${BADGE[item.badge.tone]}`}>{item.badge.text}</span>
                  )}
                  {delta !== null && (
                    <span className={`inline-flex items-center gap-0.5 rounded-full py-0.5 pr-2 pl-1.5 text-[12px] font-semibold ${pill} ${item.badge ? 'ml-2' : ''}`}>
                      {up ? <ArrowUpRight className="size-3.5" aria-hidden="true" /> : down ? <ArrowDownRight className="size-3.5" aria-hidden="true" /> : null}
                      {`${delta > 0 ? '+' : ''}${delta.toFixed(1)}%`}
                    </span>
                  )}
                  {delta !== null && item.deltaLabel && <p className="text-muted-foreground mt-1.5 truncate text-[11.5px]">{item.deltaLabel}</p>}
                </div>
                <Sparkline values={item.trend ?? []} tone={tone} width={68} height={30} />
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}
