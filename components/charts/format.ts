// Number formatting shared by the chart components (client side).
//
// Money follows MONEY_LOCALE, not the reader's language: an axis that said
// "60 mil US$" in Spanish and "$60K" in English would disagree with every
// other figure on the page. Month labels below still follow the reader.
import { MONEY_LOCALE } from '@/lib/money';

export function compactMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat(MONEY_LOCALE, {
    style: 'currency',
    currency,
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(cents / 100);
}

export function fullMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat(MONEY_LOCALE, { style: 'currency', currency }).format(cents / 100);
}

export function monthLabel(month: string, locale: string): string {
  const [y, m] = month.split('-').map(Number);
  return new Intl.DateTimeFormat(locale, { month: 'short', year: '2-digit', timeZone: 'UTC' }).format(
    new Date(Date.UTC(y ?? 2026, (m ?? 1) - 1, 1)),
  );
}

/**
 * How much room the money ticks on a Y axis need, in pixels.
 *
 * A fixed width was tuned for English, where compact currency is `$60K`.
 * Spanish spells the same amount `60 mil US$` — nearly twice as wide — and the
 * axis clipped it against the chart edge, so `60 mil US$` rendered as `mil US$`
 * and `15 mil US$` lost its `1`. An axis label that silently becomes a
 * different number is worse than a wide axis.
 *
 * Measured from the formatted strings rather than assumed, because the width
 * depends on the locale, the currency and the magnitude together. Recharts'
 * own `width="auto"` is ignored here (3.8.1), and a canvas measurement is not
 * available when this runs, so characters are costed at the average advance of
 * the 12px system sans this axis is drawn in — generous by a pixel or two,
 * which is the right direction to be wrong in.
 */
const AXIS_CHAR_PX = 6.6;
const AXIS_TICK_MARGIN_PX = 14;

export function moneyAxisWidth(values: readonly (number | null)[], currency: string): number {
  const magnitudes = values.filter((v): v is number => v !== null && Number.isFinite(v)).map(Math.abs);
  const peak = magnitudes.length > 0 ? Math.max(...magnitudes) : 0;
  // The top tick sits on a round number above the data, not on the data.
  const longest = Math.max(
    ...[0, peak, peak * 1.3].map((v) => compactMoney(v, currency).length),
  );
  return Math.min(120, Math.max(64, Math.ceil(longest * AXIS_CHAR_PX) + AXIS_TICK_MARGIN_PX));
}
