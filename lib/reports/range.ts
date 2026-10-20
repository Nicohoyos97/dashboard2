// A Profit & Loss for any range of dates — "August 15 to September 15" — added
// up from what the firm published, the way QuickBooks runs a report for the
// dates you give it.
//
// Nothing here is estimated, and nothing is prorated. A range is cut into
// pieces, each one a published Profit & Loss:
//
//   - a statement the range covers whole contributes the figures it prints;
//   - a statement the range only partly covers is split by date, and that
//     needs its General Ledger: each account line is re-added from the
//     ledger's own transactions inside the range, and the totals are
//     re-derived from those lines by the same arithmetic the statement prints
//     (lib/ingestion/reconcile-statement.ts checks it at upload).
//
// Two refusals keep that honest. A range with a day no published statement
// covers is refused rather than read as zero. A statement is split only when
// its ledger carries every account line to the cent (lib/ledger/match.ts) and
// its own printed totals come back out of its printed accounts under the rule
// below: a layout the rule does not reproduce is refused, never guessed at.
//
// A range that runs past what is published — "this year" in October — is cut
// to the published days, and the page says so.
import { addDays, daysBetween } from './dates';
import type { PeriodRange } from './periods';
import type { ReportRow } from './types';

export type RangePiece = {
  report: ReportRow;
  /** The days of `report` inside the range. */
  start: string;
  end: string;
  /** True when the range covers the whole statement, which then contributes its printed figures. */
  whole: boolean;
};

/**
 * Why a range cannot be added up:
 *   nothing_published – no published statement reaches any day of it
 *   gap               – a day inside it that no published statement covers (`at`)
 *   needs_ledger      – it cuts through a statement (`at`) whose General Ledger is not published
 *   unsplittable      – that ledger does not carry every line of the statement, or the statement's totals do not follow from its accounts
 *   layout            – the statements print the same account in two different shapes
 *   mixed_basis       – some statements are on cash and some on accrual
 */
export type RangeRefusal = 'nothing_published' | 'gap' | 'needs_ledger' | 'unsplittable' | 'layout' | 'mixed_basis';

export type RangePlan =
  | { ok: true; requested: PeriodRange; range: PeriodRange; clamped: boolean; pieces: RangePiece[] }
  | { ok: false; requested: PeriodRange; reason: RangeRefusal; at: PeriodRange | null };

function length(report: ReportRow): number {
  return daysBetween(report.periodStart, report.periodEnd) ?? Number.MAX_SAFE_INTEGER;
}

/**
 * The published statements a range is made of, oldest first. `reports` are the
 * published Profit & Loss statements of one currency; `splittable` says whether
 * a statement's General Ledger is published, which is what cutting it needs.
 *
 * At each day the walk takes the longest statement that starts there and ends
 * inside the range — whole statements need no ledger — and only otherwise
 * splits the shortest statement covering the day whose ledger is published.
 */
export function planRange(
  requested: PeriodRange,
  reports: readonly ReportRow[],
  splittable: (report: ReportRow) => boolean,
): RangePlan {
  const refuse = (reason: RangeRefusal, at: PeriodRange | null): RangePlan => ({ ok: false, requested, reason, at });
  const pnl = reports.filter((report) => report.reportType === 'profit_and_loss');
  if (pnl.length === 0 || requested.end < requested.start) return refuse('nothing_published', null);

  const first = pnl.reduce((min, report) => (report.periodStart < min ? report.periodStart : min), pnl[0]!.periodStart);
  const last = pnl.reduce((max, report) => (report.periodEnd > max ? report.periodEnd : max), pnl[0]!.periodEnd);
  const range = {
    start: requested.start > first ? requested.start : first,
    end: requested.end < last ? requested.end : last,
  };
  if (range.start > range.end) return refuse('nothing_published', null);

  const pieces: RangePiece[] = [];
  let cursor = range.start;
  while (cursor <= range.end) {
    const day = cursor;
    const covering = pnl.filter((report) => report.periodStart <= day && day <= report.periodEnd);
    if (covering.length === 0) {
      const next = pnl.map((report) => report.periodStart).filter((start) => start > day).sort()[0];
      const gapEnd = next && addDays(next, -1) < range.end ? addDays(next, -1) : range.end;
      return refuse('gap', { start: day, end: gapEnd });
    }
    const whole = covering
      .filter((report) => report.periodStart === day && report.periodEnd <= range.end)
      .sort((a, b) => b.periodEnd.localeCompare(a.periodEnd))[0];
    if (whole) {
      pieces.push({ report: whole, start: day, end: whole.periodEnd, whole: true });
      cursor = addDays(whole.periodEnd, 1);
      continue;
    }
    const shortestFirst = [...covering].sort((a, b) => length(a) - length(b));
    const split = shortestFirst.find(splittable);
    if (!split) {
      const named = shortestFirst[0]!;
      return refuse('needs_ledger', { start: named.periodStart, end: named.periodEnd });
    }
    const end = split.periodEnd < range.end ? split.periodEnd : range.end;
    pieces.push({ report: split, start: day, end, whole: false });
    cursor = addDays(end, 1);
  }

  return {
    ok: true,
    requested,
    range,
    clamped: range.start !== requested.start || range.end !== requested.end,
    pieces,
  };
}

export { sliceStatement } from './range-slice';
export { type ComposedRange, type SlicedPiece, composeRange, piecesRows, rangeLineId } from './range-compose';
