// Relative date presets for the period picker — the shapes an owner actually
// asks for ("this quarter", "last year") rather than the list of ranges the
// firm happens to have published.
//
// These are two different questions and the portal must not blur them. A
// preset resolves to a calendar range; whether a published statement covers
// that range is answered separately, and when nothing does the page says so
// instead of estimating from a longer period (spec §3, and the reason
// granularity.ts exists). Everything here is pure date arithmetic on the
// business's own "today", so a Florida client's "this month" is their month.
import {
  firstDayOfMonth,
  lastDayOfMonth,
  monthFromIndex,
  monthIndex,
  parseIsoDate,
} from './dates';
import type { PeriodRange } from './periods';

export const PERIOD_PRESETS = [
  'this_month',
  'last_month',
  'this_quarter',
  'last_quarter',
  'this_year',
  'last_year',
  'custom',
] as const;

export type PeriodPreset = (typeof PERIOD_PRESETS)[number];

/** Presets that resolve to a range on their own; `custom` needs the user's dates. */
export type RelativePreset = Exclude<PeriodPreset, 'custom'>;

function monthsBack(today: string, months: number): { year: number; month: number } | null {
  const parts = parseIsoDate(today);
  if (!parts) return null;
  return monthFromIndex(monthIndex(parts.year, parts.month) - months);
}

function quarterOf(month: number): number {
  return Math.floor((month - 1) / 3);
}

/**
 * The calendar range a preset covers, resolved against the business's today.
 * Null when the date cannot be read — never a guessed range.
 */
export function presetRange(preset: RelativePreset, today: string): PeriodRange | null {
  const parts = parseIsoDate(today);
  if (!parts) return null;

  switch (preset) {
    case 'this_month':
      return {
        start: firstDayOfMonth(parts.year, parts.month),
        end: lastDayOfMonth(parts.year, parts.month),
      };
    case 'last_month': {
      const previous = monthsBack(today, 1);
      if (!previous) return null;
      return {
        start: firstDayOfMonth(previous.year, previous.month),
        end: lastDayOfMonth(previous.year, previous.month),
      };
    }
    case 'this_quarter': {
      const first = quarterOf(parts.month) * 3 + 1;
      return {
        start: firstDayOfMonth(parts.year, first),
        end: lastDayOfMonth(parts.year, first + 2),
      };
    }
    case 'last_quarter': {
      const first = quarterOf(parts.month) * 3 + 1;
      const previous = monthFromIndex(monthIndex(parts.year, first) - 3);
      return {
        start: firstDayOfMonth(previous.year, previous.month),
        end: lastDayOfMonth(previous.year, previous.month + 2),
      };
    }
    case 'this_year':
      return { start: firstDayOfMonth(parts.year, 1), end: lastDayOfMonth(parts.year, 12) };
    case 'last_year':
      return {
        start: firstDayOfMonth(parts.year - 1, 1),
        end: lastDayOfMonth(parts.year - 1, 12),
      };
  }
}

/** The preset a range corresponds to, or null when it matches none of them. */
export function presetOf(range: PeriodRange, today: string): RelativePreset | null {
  for (const preset of PERIOD_PRESETS) {
    if (preset === 'custom') continue;
    const resolved = presetRange(preset, today);
    if (resolved && resolved.start === range.start && resolved.end === range.end) return preset;
  }
  return null;
}

/** True when some published period covers exactly this range. */
export function rangeIsPublished(
  range: PeriodRange,
  published: readonly PeriodRange[],
): boolean {
  return published.some((period) => period.start === range.start && period.end === range.end);
}

/**
 * The preset rows the picker offers, resolved once on the server so no date
 * arithmetic runs in the browser and every page agrees on what "this quarter"
 * means for this business.
 */
export function presetChoices(
  today: string,
  published: readonly PeriodRange[],
  label: (range: PeriodRange) => string,
): { preset: RelativePreset; value: string; label: string; published: boolean }[] {
  return PERIOD_PRESETS.flatMap((preset) => {
    if (preset === 'custom') return [];
    const range = presetRange(preset, today);
    if (!range) return [];
    return [
      {
        preset,
        value: `${range.start}_${range.end}`,
        label: label(range),
        published: rangeIsPublished(range, published),
      },
    ];
  });
}
