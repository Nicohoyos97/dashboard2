// What the Overview, the P&L and Expenses show for `?period=`: the published
// statement for exactly those dates when there is one — with everything a
// document brings, its pages and its comparative column — and otherwise the
// range added up (lib/portal/range-statement.ts). No `period` is the newest
// published statement, as it always was.
import 'server-only';

import type { PeriodBarProps } from '@/components/dashboard/ReportPeriodBar';
import { type PeriodRange, priorPeriod } from '@/lib/reports/periods';
import { PERIOD_PRESETS, type RelativePreset, presetRange } from '@/lib/reports/presets';
import type { RangeRefusal } from '@/lib/reports/range';
import type { ReportRow } from '@/lib/reports/types';
import { formatPeriod } from '@/lib/utils/dates';

import { loadPublishedLedgers } from '@/lib/ledger/load';

import { loadPublishedReports } from './load';
import { parsePeriodParam, periodParam } from './period-param';
import { type RangeFigures, rangeFigures } from './range-figures';
import { type RangeContext, type RangeOutcome, type RangeStatement, composeRanges, coveredRange } from './range-statement';

export type PeriodSelection = { mode: 'report'; report: ReportRow } | { mode: 'range'; requested: PeriodRange };

/**
 * `reports`: published Profit & Loss statements, newest first. Null when there
 * are none, whatever the URL asks for — a business without a P&L is read off
 * its bank statements (Expenses) or has nothing to add up.
 */
export function selectPeriod(reports: readonly ReportRow[], param: string | undefined): PeriodSelection | null {
  if (reports.length === 0) return null;
  const wanted = parsePeriodParam(param);
  if (wanted) {
    const exact = reports.find((report) => report.periodStart === wanted.start && report.periodEnd === wanted.end);
    return exact ? { mode: 'report', report: exact } : { mode: 'range', requested: wanted };
  }
  const newest = reports[0];
  return newest ? { mode: 'report', report: newest } : null;
}

export function selectedRange(selection: PeriodSelection): PeriodRange {
  return selection.mode === 'report'
    ? { start: selection.report.periodStart, end: selection.report.periodEnd }
    : selection.requested;
}

/** The bar's named periods, resolved in the business's calendar, and the dates on screen. */
export function periodBarProps({
  selected,
  today,
  presetLabel,
}: {
  selected: PeriodRange;
  /** todayIn(business timezone): a Florida client's "last month" is theirs. */
  today: string;
  presetLabel: (preset: RelativePreset) => string;
}): PeriodBarProps {
  return {
    presets: PERIOD_PRESETS.flatMap((preset) => {
      if (preset === 'custom') return [];
      const range = presetRange(preset, today);
      return range ? [{ value: periodParam(range), label: presetLabel(preset) }] : [];
    }),
    from: selected.start,
    to: selected.end,
  };
}

export type RangeView =
  | { ok: true; statement: RangeStatement; prior: RangeStatement | null }
  | Extract<RangeOutcome, { ok: false }>;

/**
 * The range and, when it can be added up the same way, the range of the same
 * length just before it — the comparison a QuickBooks report calls "previous
 * period". One wave of reads for both. A previous range that would itself be
 * cut short is no comparison and is left out.
 */
export async function loadRangeView(
  supabase: Parameters<typeof composeRanges>[0],
  entityId: string,
  context: RangeContext,
  requested: PeriodRange,
): Promise<RangeView> {
  const covered = coveredRange(context, requested);
  const before = covered ? priorPeriod(covered) : null;
  const [first, prior] = await composeRanges(supabase, entityId, context, before ? [requested, before] : [requested]);
  if (!first || !first.ok) return first ?? { ok: false, requested, reason: 'nothing_published', at: null };
  return { ok: true, statement: first.statement, prior: prior?.ok && !prior.statement.clamped ? prior.statement : null };
}

/**
 * The sentence that says why a range shows what it shows, in the reader's
 * language: cut to the published days, or not added up at all and why.
 */
export function rangeNotice(
  view: RangeView,
  t: (key: string, values?: Record<string, string>) => string,
  locale: string,
): string | null {
  if (view.ok) {
    if (!view.statement.clamped) return null;
    return t('rangeClamped', { period: formatPeriod(view.statement.report.periodStart, view.statement.report.periodEnd, locale) });
  }
  const at = view.at ? formatPeriod(view.at.start, view.at.end, locale) : '';
  const keys: Record<RangeRefusal, string> = {
    nothing_published: 'rangeNothing',
    gap: 'rangeGap',
    needs_ledger: 'rangeNeedsLedger',
    unsplittable: 'rangeUnsplittable',
    layout: 'rangeLayout',
    mixed_basis: 'rangeMixedBasis',
  };
  return t(keys[view.reason], { period: at });
}

/** A range read for an export, which has only the URL: its figures with the previous range beside them, or null. */
export async function loadRangeFigures(
  supabase: Parameters<typeof composeRanges>[0],
  entityId: string,
  currency: string,
  period: PeriodRange,
): Promise<RangeFigures | null> {
  const [reports, ledgers] = await Promise.all([loadPublishedReports(supabase, entityId), loadPublishedLedgers(supabase, entityId)]);
  const view = await loadRangeView(supabase, entityId, { reports, ledgers, currency }, period);
  return view.ok ? rangeFigures(view.statement, view.prior, periodParam(period)) : null;
}
