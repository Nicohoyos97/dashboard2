'use client';

import { CATEGORICAL } from '@/lib/charts/palette';

import { fullMoney } from './format';

export type CompositionItem = { label: string; cents: number };

// Share of a total as horizontal bars (magnitude, low → high is obvious from
// length; color only carries identity, fixed order, ≤ 5 classes + Other).
// Plain HTML: every value is visible, so no tooltip is needed to read it.
export function CompositionBars({ items, currency, otherLabel }: { items: CompositionItem[]; currency: string; otherLabel: string }) {
  const sorted = [...items].filter((i) => i.cents > 0).sort((a, b) => b.cents - a.cents);
  const top = sorted.slice(0, CATEGORICAL.length - 1);
  const rest = sorted.slice(CATEGORICAL.length - 1);
  const rows = rest.length > 0 ? [...top, { label: otherLabel, cents: rest.reduce((s, i) => s + i.cents, 0) }] : top;
  const total = rows.reduce((s, r) => s + r.cents, 0);
  if (total === 0) return null;

  return (
    <ul className="flex flex-col gap-3">
      {rows.map((r, i) => {
        const pct = Math.round((r.cents / total) * 1000) / 10;
        return (
          <li key={r.label} className="text-[13.5px]">
            <div className="flex items-center justify-between gap-3">
              <span className="text-ink flex min-w-0 items-center gap-2 font-medium">
                <span className="size-2.5 shrink-0 rounded-full" style={{ background: CATEGORICAL[i] }} aria-hidden="true" />
                <span className="truncate">{r.label}</span>
              </span>
              <span className="text-muted-foreground shrink-0 tabular-nums">
                {fullMoney(r.cents, currency)} · {pct}%
              </span>
            </div>
            <div className="bg-secondary mt-1.5 h-2 w-full overflow-hidden rounded-full" role="presentation">
              <div className="h-full rounded-full" style={{ width: `${pct}%`, background: CATEGORICAL[i] }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
