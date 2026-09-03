// Balance Sheet headline figures from printed totals, plus the derived values
// spec §7 allows only when their inputs are printed: working capital, current
// ratio, debt-to-asset, and the accounting equation check.
import { RECONCILE_TOLERANCE_CENTS } from '@/lib/ingestion/reconciliation';
import { variance } from '@/lib/money';

import { emptyMetric, findTotal, metricFromLine, reasonProp } from './sections';
import type { Figure, LineNode, Metric, MetricReason, Ratio, ReportRow } from './types';

/** Headings after normalisation (apostrophes dropped, "&" → "and", leading "Total" stripped). */
export const BALANCE_SYNONYMS = {
  totalAssets: ['assets'],
  totalLiabilities: ['liabilities'],
  totalEquity: ['equity', 'stockholders equity', 'shareholders equity', 'owners equity', 'members equity', 'partners equity'],
  currentAssets: ['current assets'],
  currentLiabilities: ['current liabilities'],
} as const;

const LIABILITIES_AND_EQUITY = BALANCE_SYNONYMS.totalEquity.map((equity) => `liabilities and ${equity}`);

export type BalanceMetricKey = keyof typeof BALANCE_SYNONYMS;

export type BalanceSheetMetrics = Record<BalanceMetricKey, Metric> & {
  /** Current assets − current liabilities; only when both totals are printed. */
  workingCapital: Metric;
  currentRatio: Ratio;
  debtToAsset: Ratio;
  /** Assets = liabilities + equity within the reconciliation tolerance; null when a side is not printed. */
  equationOk: boolean | null;
};

function derived(cents: number, label: string, report: ReportRow): Figure {
  // A computed figure has no line of its own; the UI cites its inputs.
  return { cents, lineId: null, page: null, source: report.source, label };
}

function workingCapitalMetric(assets: Metric, liabilities: Metric, report: ReportRow): Metric {
  if (!assets.current || !liabilities.current) return emptyMetric('workingCapital', 'missing_inputs');
  const current = derived(assets.current.cents - liabilities.current.cents, 'workingCapital', report);
  const prior =
    assets.prior && liabilities.prior
      ? derived(assets.prior.cents - liabilities.prior.cents, 'workingCapital', report)
      : null;
  const change = prior ? variance(current.cents, prior.cents) : null;
  const reason: MetricReason | undefined = prior ? undefined : report.comparativeStart ? 'no_prior_total' : 'no_prior_column';
  return {
    key: 'workingCapital',
    current,
    prior,
    deltaCents: change?.deltaCents ?? null,
    deltaPct: change?.pct ?? null,
    ...reasonProp(reason),
  };
}

function ratioOf(numerator: Figure | null, denominator: Figure | null): number | null {
  if (!numerator || !denominator || denominator.cents === 0) return null;
  return Math.round((numerator.cents / denominator.cents) * 100) / 100;
}

function ratio(key: string, numerator: Metric, denominator: Metric): Ratio {
  const current = ratioOf(numerator.current, denominator.current);
  const prior = ratioOf(numerator.prior, denominator.prior);
  let reason: MetricReason | undefined;
  if (!numerator.current || !denominator.current) reason = 'missing_inputs';
  else if (denominator.current.cents === 0) reason = 'divide_by_zero';
  return { key, current, prior, ...reasonProp(reason) };
}

function equationHolds(roots: readonly LineNode[], assets: Metric, liabilities: Metric, equity: Metric): boolean | null {
  if (!assets.current) return null;
  const combined = findTotal(roots, LIABILITIES_AND_EQUITY);
  const rightSide =
    liabilities.current && equity.current
      ? liabilities.current.cents + equity.current.cents
      : combined?.currentCents ?? null;
  if (rightSide === null) return null;
  return Math.abs(assets.current.cents - rightSide) <= RECONCILE_TOLERANCE_CENTS;
}

export function balanceSheetMetrics(report: ReportRow, roots: readonly LineNode[]): BalanceSheetMetrics {
  const totalAssets = metricFromLine('totalAssets', findTotal(roots, BALANCE_SYNONYMS.totalAssets), report);
  const totalLiabilities = metricFromLine('totalLiabilities', findTotal(roots, BALANCE_SYNONYMS.totalLiabilities), report);
  const totalEquity = metricFromLine('totalEquity', findTotal(roots, BALANCE_SYNONYMS.totalEquity), report);
  const currentAssets = metricFromLine('currentAssets', findTotal(roots, BALANCE_SYNONYMS.currentAssets), report);
  const currentLiabilities = metricFromLine('currentLiabilities', findTotal(roots, BALANCE_SYNONYMS.currentLiabilities), report);

  return {
    totalAssets,
    totalLiabilities,
    totalEquity,
    currentAssets,
    currentLiabilities,
    workingCapital: workingCapitalMetric(currentAssets, currentLiabilities, report),
    currentRatio: ratio('currentRatio', currentAssets, currentLiabilities),
    debtToAsset: ratio('debtToAsset', totalLiabilities, totalAssets),
    equationOk: equationHolds(roots, totalAssets, totalLiabilities, totalEquity),
  };
}
