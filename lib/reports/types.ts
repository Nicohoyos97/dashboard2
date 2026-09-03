// Plain-object contract between the portal loaders (lib/portal/load.ts) and
// the pure read models in this folder. Money is integer cents; dates are ISO
// `YYYY-MM-DD` strings straight from Postgres `date` columns. Nothing here
// touches the database.

export type ReportType = 'profit_and_loss' | 'balance_sheet';
export type ReportSource = 'firm_document' | 'firm_entry';
export type AccountingBasis = 'cash' | 'accrual';

export type LineRow = {
  id: string;
  parentLineId: string | null;
  position: number;
  depth: number;
  section: string | null;
  accountName: string;
  accountNumber: string | null;
  currentCents: number | null;
  priorCents: number | null;
  isSection: boolean;
  isTotal: boolean;
  pageNumber: number | null;
  confidence: number | null;
};

export type LineNode = LineRow & {
  children: LineNode[];
  deltaCents: number | null;
  deltaPct: number | null;
};

export type ReportRow = {
  id: string;
  reportType: ReportType;
  basis: AccountingBasis | null;
  currency: string;
  periodStart: string;
  periodEnd: string;
  comparativeStart: string | null;
  comparativeEnd: string | null;
  source: ReportSource;
  documentVersionId: string | null;
  publishedAt: string | null;
};

/** A figure the UI can cite: which line (and page) it was read from. `lineId` is null for a figure computed from other figures. */
export type Figure = {
  cents: number;
  lineId: string | null;
  page: number | null;
  source: ReportSource;
  label: string;
};

/**
 * Why a value is null. Machine keys so the UI can translate them:
 *   no_printed_total  – the statement prints no total the synonym table recognises
 *   no_prior_column   – the statement has no comparative column at all
 *   no_prior_total    – a comparative column exists but this total is blank in it
 *   missing_inputs    – a derived figure needs a total that is missing
 *   divide_by_zero    – the denominator (revenue, assets, current liabilities) is zero
 */
export type MetricReason =
  | 'no_printed_total'
  | 'no_prior_column'
  | 'no_prior_total'
  | 'missing_inputs'
  | 'divide_by_zero';

/** `reason` explains why `current` is null or, when `current` exists, why the delta is null. */
export type Metric = {
  key: string;
  current: Figure | null;
  prior: Figure | null;
  deltaCents: number | null;
  deltaPct: number | null;
  reason?: MetricReason;
};

/** A ratio derived in TypeScript from printed totals; rounded to 2 decimals. */
export type Ratio = {
  key: string;
  current: number | null;
  prior: number | null;
  reason?: MetricReason;
};
