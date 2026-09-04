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

export function comparableSeries<T extends Comparable>(reports: readonly T[], reference: Comparable): T[] {
  const kind = periodKind(reference.periodStart, reference.periodEnd);
  return reports.filter(
    (report) =>
      report.reportType === reference.reportType &&
      report.currency === reference.currency &&
      report.periodEnd <= reference.periodEnd &&
      periodKind(report.periodStart, report.periodEnd) === kind,
  );
}
