'use client';

import { fullMoney } from './format';

export type TooltipRow = { name: string; value: number; color: string };

// One tooltip look for every chart: title, then a row per series with its
// swatch. Values are the full currency string (the axis is compact).
export function ChartTooltip({
  active,
  label,
  rows,
  currency,
  locale,
}: {
  active?: boolean | undefined;
  label?: string | undefined;
  rows: TooltipRow[];
  currency: string;
  locale: string;
}) {
  if (!active || rows.length === 0) return null;
  return (
    <div className="border-line bg-card rounded-xl border px-3 py-2 text-[12.5px] shadow-[0_8px_24px_rgba(15,23,42,0.12)]">
      {label && <p className="text-ink mb-1 font-semibold">{label}</p>}
      {rows.map((r) => (
        <p key={r.name} className="text-ink flex items-center gap-2">
          <span className="size-2.5 rounded-full" style={{ background: r.color }} aria-hidden="true" />
          <span className="text-muted-foreground flex-1">{r.name}</span>
          <span className="font-medium tabular-nums">{fullMoney(r.value, currency, locale)}</span>
        </p>
      ))}
    </div>
  );
}
