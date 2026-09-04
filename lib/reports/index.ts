// Public surface of the pure read models the client portal renders. Nothing
// here talks to the database: loaders (lib/portal/load.ts) pass plain rows in.
export type {
  AccountingBasis,
  Figure,
  LineNode,
  LineRow,
  Metric,
  MetricReason,
  Ratio,
  ReportRow,
  ReportSource,
  ReportType,
} from './types';
export { buildTree, findLine, flattenTree } from './tree';
export type { FlattenOptions } from './tree';
export { PNL_SYNONYMS, marginPct, pnlMetrics } from './pnl';
export type { PnlMetricKey, PnlMetrics } from './pnl';
export { BALANCE_SYNONYMS, balanceSheetMetrics } from './balance-sheet';
export type { BalanceMetricKey, BalanceSheetMetrics } from './balance-sheet';
export { availablePeriods, bankAccountsCoverPeriod, granularity, periodKind, periodLabel, priorPeriod, rangeCovered } from './periods';
export type {
  Granularity,
  GranularityReason,
  GranularityState,
  Period,
  PeriodKind,
  PeriodRange,
  PeriodSource,
  PriorPeriod,
} from './periods';
export { csvField, spreadsheetText, statementCsv, statementCsvFilename } from './csv';
export type { CsvHeaders, StatementCsvOptions } from './csv';
export { addDays, daysBetween, monthKey, parseIsoDate } from './dates';
