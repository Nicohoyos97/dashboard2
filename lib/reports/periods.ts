// Which periods have data and which granularities the sources support.
// Spec §3: never fabricate granularity — a half-year P&L cannot show months;
// daily bank transactions can be bucketed into any calendar unit.
import {
  addDays,
  daysBetween,
  firstDayOfMonth,
  formatDate,
  lastDayOfMonth,
  monthFromIndex,
  monthIndex,
  parseIsoDate,
  wholeMonths,
} from './dates';
import type { ReportRow } from './types';

export type PeriodKind = 'month' | 'quarter' | 'year' | 'custom';
export type PeriodSource = 'pnl' | 'balance_sheet' | 'bank';
export type Period = { start: string; end: string; label: string; kind: PeriodKind; sources: PeriodSource[] };
export type PeriodRange = { start: string; end: string };

const MONTHS_PER_KIND: Record<number, PeriodKind> = { 1: 'month', 3: 'quarter', 12: 'year' };
const CALENDAR_QUARTER_STARTS = [1, 4, 7, 10];

/** A fiscal quarter/year (whole months not aligned to the calendar) still counts as that kind. */
export function periodKind(start: string, end: string): PeriodKind {
  const months = wholeMonths(start, end);
  return (months === null ? undefined : MONTHS_PER_KIND[months]) ?? 'custom';
}

function monthYear(date: string, locale: string): string {
  return formatDate(date, locale, { month: 'short', year: 'numeric' });
}

export function periodLabel(start: string, end: string, kind: PeriodKind, locale = 'en'): string {
  const from = parseIsoDate(start);
  const to = parseIsoDate(end);
  if (!from || !to) return `${start} – ${end}`;
  if (kind === 'month') return monthYear(start, locale);
  if (kind === 'quarter' && CALENDAR_QUARTER_STARTS.includes(from.month)) {
    return `Q${Math.floor((from.month - 1) / 3) + 1} ${from.year}`;
  }
  if (kind === 'year' && from.month === 1) return String(from.year);
  if (kind === 'quarter' || kind === 'year') return `${monthYear(start, locale)} – ${monthYear(end, locale)}`;
  const day = { month: 'short', day: 'numeric', year: 'numeric' } as const;
  return `${formatDate(start, locale, day)} – ${formatDate(end, locale, day)}`;
}

/** Distinct periods that have published data, newest first, with the sources that cover each. */
export function availablePeriods(
  reports: readonly ReportRow[],
  statements: readonly { periodStart: string; periodEnd: string }[],
  { locale = 'en' }: { locale?: string } = {},
): Period[] {
  const periods = new Map<string, Period>();
  const add = (start: string, end: string, source: PeriodSource) => {
    const key = `${start}_${end}`;
    const existing = periods.get(key);
    if (existing) {
      if (!existing.sources.includes(source)) existing.sources.push(source);
      return;
    }
    const kind = periodKind(start, end);
    periods.set(key, { start, end, kind, label: periodLabel(start, end, kind, locale), sources: [source] });
  };
  for (const report of reports) {
    add(report.periodStart, report.periodEnd, report.reportType === 'balance_sheet' ? 'balance_sheet' : 'pnl');
  }
  for (const statement of statements) add(statement.periodStart, statement.periodEnd, 'bank');
  return [...periods.values()].sort((a, b) => (a.end === b.end ? b.start.localeCompare(a.start) : b.end.localeCompare(a.end)));
}

export type GranularityReason = 'no_monthly_source' | 'no_quarterly_source' | 'no_annual_source';
export type GranularityState = { enabled: boolean; reason?: GranularityReason };
export type Granularity = { month: GranularityState; quarter: GranularityState; year: GranularityState };

/**
 * A granularity is offered only when a source covers it: a report of that
 * exact kind, or bank transactions (daily rows bucket into any unit).
 */
export function granularity(periods: readonly Period[], hasMonthlyBank: boolean): Granularity {
  const state = (kind: PeriodKind, reason: GranularityReason): GranularityState =>
    hasMonthlyBank || periods.some((p) => p.kind === kind) ? { enabled: true } : { enabled: false, reason };
  return {
    month: state('month', 'no_monthly_source'),
    quarter: state('quarter', 'no_quarterly_source'),
    year: state('year', 'no_annual_source'),
  };
}

export type PriorPeriod = PeriodRange & { kind: PeriodKind; label: string };

/** True only when published source spans cover every calendar day in a range. */
export function rangeCovered(period: PeriodRange, spans: readonly PeriodRange[]): boolean {
  if (!parseIsoDate(period.start) || !parseIsoDate(period.end) || period.end < period.start) return false;
  const ordered = spans
    .filter((span) => span.end >= period.start && span.start <= period.end)
    .sort((a, b) => a.start.localeCompare(b.start));
  let cursor = period.start;
  for (const span of ordered) {
    if (span.start > cursor) return false;
    if (span.end >= period.end) return true;
    if (span.end >= cursor) cursor = addDays(span.end, 1);
  }
  return false;
}

/**
 * Entity-wide cash can be shown only when every account with published data
 * has continuous coverage for the period. Otherwise a partial total would
 * look like the business's full cash movement.
 */
export function bankAccountsCoverPeriod(
  statements: readonly (PeriodRange & { bankAccountId: string })[],
  period: PeriodRange,
): boolean {
  const accountIds = [...new Set(statements.map((statement) => statement.bankAccountId))];
  return accountIds.length > 0 && accountIds.every((accountId) =>
    rangeCovered(period, statements.filter((statement) => statement.bankAccountId === accountId)),
  );
}

/**
 * The comparable period ending the day before `period` starts: the same
 * number of whole months when the period is month-aligned (Feb → Jan, not
 * "28 days"), otherwise the same number of days.
 */
export function priorPeriod(period: PeriodRange, locale = 'en'): PriorPeriod | null {
  const start = parseIsoDate(period.start);
  const end = parseIsoDate(period.end);
  if (!start || !end || period.end < period.start) return null;
  const months = wholeMonths(period.start, period.end);
  let range: PeriodRange;
  if (months !== null) {
    const first = monthFromIndex(monthIndex(start.year, start.month) - months);
    const last = monthFromIndex(monthIndex(start.year, start.month) - 1);
    range = { start: firstDayOfMonth(first.year, first.month), end: lastDayOfMonth(last.year, last.month) };
  } else {
    const length = daysBetween(period.start, period.end) ?? 0;
    const priorEnd = addDays(period.start, -1);
    range = { start: addDays(priorEnd, -length), end: priorEnd };
  }
  const kind = periodKind(range.start, range.end);
  return { ...range, kind, label: periodLabel(range.start, range.end, kind, locale) };
}
