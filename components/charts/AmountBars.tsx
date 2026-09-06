import { CATEGORICAL } from '@/lib/charts/palette';

import { fullMoney } from './format';

export type AmountBarItem = { label: string; cents: number | null };

/**
 * Named amounts as horizontal bars, in the order given.
 *
 * The shape is CompositionBars', the arithmetic deliberately is not: that one
 * prints each slice's share of a total, and these figures are not parts of one
 * whole. Refunds and discounts are what gross sales lost on the way to net,
 * tips pass through to the staff, and tax collected is held for the state — a
 * percentage across them would be a denominator no document prints and the
 * client could not check (spec §10). So the bar carries magnitude against the
 * largest figure on show, and the number beside it carries the value.
 *
 * A figure the report does not print is dropped rather than drawn as zero: the
 * client's register either stated it or did not.
 */
export function AmountBars({ items, currency }: { items: readonly AmountBarItem[]; currency: string }) {
  const rows = items.flatMap((item) => (item.cents === null ? [] : [{ label: item.label, cents: item.cents }]));
  if (rows.length === 0) return null;
  const peak = Math.max(...rows.map((row) => Math.abs(row.cents)));

  return (
    <ul className="flex flex-col gap-3">
      {rows.map((row, index) => (
        <li key={row.label} className="text-[13.5px]">
          <div className="flex items-center justify-between gap-3">
            <span className="text-ink flex min-w-0 items-center gap-2 font-medium">
              <span
                className="size-2.5 shrink-0 rounded-full"
                style={{ background: CATEGORICAL[index % CATEGORICAL.length] }}
                aria-hidden="true"
              />
              <span className="truncate">{row.label}</span>
            </span>
            <span className="text-muted-foreground shrink-0 tabular-nums">{fullMoney(row.cents, currency)}</span>
          </div>
          <div className="bg-secondary mt-1.5 h-2 w-full overflow-hidden rounded-full" role="presentation">
            <div
              className="h-full rounded-full"
              style={{
                width: `${peak === 0 ? 0 : (Math.abs(row.cents) / peak) * 100}%`,
                background: CATEGORICAL[index % CATEGORICAL.length],
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
