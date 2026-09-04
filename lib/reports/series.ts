// Which published reports may sit in one trend beside a given report.
//
// A chart's shape is its message, so every bar has to be commensurable with
// the others: the same statement, the same reporting granularity, the same
// currency, and nothing from after the period on screen. The Overview already
// filtered by granularity and said why; the statement pages trended whatever
// happened to be the most recent rows, so an annual statement beside monthly
// ones read as a collapse and a CAD report was labelled in USD.
import { periodKind } from './periods';

type Comparable = {
  reportType: 'profit_and_loss' | 'balance_sheet';
  currency: string;
  periodStart: string;
  periodEnd: string;
};

/**
 * Same statement, same currency, same reporting granularity. This is what makes
 * two periods worth putting side by side; whether one comes before the other is
 * a separate question, and only a trend cares about it.
 */
export function isComparable(report: Comparable, reference: Comparable): boolean {
  return (
    report.reportType === reference.reportType &&
    report.currency === reference.currency &&
    periodKind(report.periodStart, report.periodEnd) ===
      periodKind(reference.periodStart, reference.periodEnd)
  );
}

/** Comparable, and not after the period on screen — a trend must not draw the future. */
export function comparableSeries<T extends Comparable>(reports: readonly T[], reference: Comparable): T[] {
  return reports.filter(
    (report) => isComparable(report, reference) && report.periodEnd <= reference.periodEnd,
  );
}

/**
 * Comparable, in either direction. A client viewing July may reasonably ask how
 * it sits against August; the date bound above belongs to trends, not to this.
 */
export function comparableTo<T extends Comparable>(reports: readonly T[], reference: Comparable): T[] {
  return reports.filter((report) => isComparable(report, reference));
}
