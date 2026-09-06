import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

import type { Metric, MetricReason, Ratio } from '@/lib/reports/types';
import { formatCents } from '@/lib/money';

export type MetricCardItem =
  | { kind: 'money'; label: string; metric: Metric; upIsGood: boolean }
  | { kind: 'ratio'; label: string; ratio: Ratio; upIsGood: boolean; format: 'pct' | 'x' };

// Headline cards for a statement (§7 P&L / Balance Sheet cards). A figure that
// the statement does not print is shown as "not printed" with the reason —
// never estimated. Deltas are contextual (upIsGood) and carry a sign + arrow.
export async function MetricCards({ items, currency }: { items: MetricCardItem[]; currency: string }) {
  const t = await getTranslations('Statements');
  const money = (cents: number) => formatCents(cents, currency);
  const reasonText = (reason: MetricReason | undefined) =>
    reason === 'no_printed_total' ? t('notPrinted') : reason ? t(`reason_${reason}`) : t('notCalculable');

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((item) => {
        const current = item.kind === 'money' ? item.metric.current?.cents ?? null : item.ratio.current;
        const prior = item.kind === 'money' ? item.metric.prior?.cents ?? null : item.ratio.prior;
        const reason = item.kind === 'money' ? item.metric.reason : item.ratio.reason;
        const delta = current !== null && prior !== null ? current - prior : null;
        const deltaPct = item.kind === 'money' ? item.metric.deltaPct : null;
        const up = delta !== null && delta > 0;
        const down = delta !== null && delta < 0;
        const good = (up && item.upIsGood) || (down && !item.upIsGood);
        const bad = (up && !item.upIsGood) || (down && item.upIsGood);
        const tone = good ? 'bg-success/10 text-success' : bad ? 'bg-danger/10 text-danger' : 'bg-secondary text-muted-foreground';
        const value =
          current === null ? null : item.kind === 'money' ? money(current) : item.format === 'pct' ? `${current.toFixed(1)}%` : `${current.toFixed(2)}×`;
        const deltaText =
          delta === null
            ? null
            : item.kind === 'money'
              ? deltaPct !== null
                ? `${deltaPct > 0 ? '+' : ''}${deltaPct.toFixed(1)}%`
                : `${delta > 0 ? '+' : ''}${money(delta)}`
              : `${delta > 0 ? '+' : ''}${delta.toFixed(item.format === 'pct' ? 1 : 2)}${item.format === 'pct' ? ' pts' : ''}`;

        return (
          <article key={item.label} className="border-line bg-card rounded-2xl border p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <p className="text-muted-foreground text-[12.5px] font-medium">{item.label}</p>
            {value === null ? (
              <p className="text-muted-foreground mt-1.5 text-[13px] leading-snug">{reasonText(reason)}</p>
            ) : (
              <p className="text-ink mt-1.5 text-[22px] leading-none font-bold tracking-[-0.02em] tabular-nums">{value}</p>
            )}
            {value !== null && (
              <p className="mt-2 text-[12px]">
                {deltaText ? (
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold ${tone}`}>
                    {up ? <ArrowUpRight className="size-3.5" aria-hidden="true" /> : down ? <ArrowDownRight className="size-3.5" aria-hidden="true" /> : null}
                    {deltaText}
                  </span>
                ) : (
                  <span className="text-muted-foreground">{reason ? reasonText(reason) : t('noPriorShort')}</span>
                )}
              </p>
            )}
          </article>
        );
      })}
    </div>
  );
}
