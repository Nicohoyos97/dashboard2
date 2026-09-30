import { getTranslations } from 'next-intl/server';

import { DeltaPill } from '@/components/dashboard/DeltaPill';
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
        const value =
          current === null ? null : item.kind === 'money' ? money(current) : item.format === 'pct' ? `${current.toFixed(1)}%` : `${current.toFixed(2)}×`;
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

        return (
          <article key={item.label} className="border-line bg-card rounded-2xl border p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <div className="flex items-start justify-between gap-2">
              <p className="text-muted-foreground text-[12.5px] font-medium">{item.label}</p>
              {value !== null && change !== null && magnitude !== null && (
                <DeltaPill change={change} magnitude={magnitude} upIsGood={item.upIsGood} />
              )}
            </div>
            {value === null ? (
              <p className="text-muted-foreground mt-1.5 text-[13px] leading-snug">{reasonText(reason)}</p>
            ) : (
              <p className="text-ink mt-1 text-[22px] leading-tight font-bold tracking-[-0.02em] tabular-nums">{value}</p>
            )}
            {value !== null && change === null && (
              <p className="text-muted-foreground mt-2 text-[12px]">{reason ? reasonText(reason) : t('noPriorShort')}</p>
            )}
          </article>
        );
      })}
    </div>
  );
}
