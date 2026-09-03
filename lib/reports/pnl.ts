// Profit & Loss headline figures, read from the statement's own printed
// totals; margins are the only computed values and are plain TypeScript
// division (spec §3: the model never does arithmetic, we never fabricate).
import { findTotal, metricFromLine } from './sections';
import type { Figure, LineNode, Metric, MetricReason, ReportRow } from './types';

/** Printed headings recognised for each headline total, after normalisation and with a leading "Total" stripped. */
export const PNL_SYNONYMS = {
  revenue: ['income', 'revenue', 'revenues', 'sales'],
  cogs: ['cost of goods sold', 'cost of sales', 'cogs'],
  grossProfit: ['gross profit'],
  operatingExpenses: ['expenses', 'operating expenses'],
  // "Net Operating Income" is accepted because some layouts print nothing
  // below it; when a later "Net Income" exists the last match wins.
  netIncome: ['net income', 'net profit', 'net earnings', 'net loss', 'net operating income'],
} as const;

export type PnlMetricKey = keyof typeof PNL_SYNONYMS;

export type PnlMetrics = Record<PnlMetricKey, Metric> & {
  /** Percent of revenue, one decimal, null when revenue or the numerator is not printed. */
  grossMarginPct: number | null;
  netMarginPct: number | null;
  priorGrossMarginPct: number | null;
  priorNetMarginPct: number | null;
  /** Why a margin is null (the field itself says which one). */
  marginReason?: MetricReason;
};

export function marginPct(numerator: Figure | null, revenue: Figure | null): number | null {
  if (!numerator || !revenue || revenue.cents === 0) return null;
  return Math.round((numerator.cents / revenue.cents) * 1000) / 10;
}

function marginReason(revenue: Metric, grossProfit: Metric, netIncome: Metric): MetricReason | undefined {
  if (!revenue.current || !grossProfit.current || !netIncome.current) return 'missing_inputs';
  if (revenue.current.cents === 0) return 'divide_by_zero';
  return undefined;
}

export function pnlMetrics(report: ReportRow, roots: readonly LineNode[]): PnlMetrics {
  const revenue = metricFromLine('revenue', findTotal(roots, PNL_SYNONYMS.revenue), report);
  const cogs = metricFromLine('cogs', findTotal(roots, PNL_SYNONYMS.cogs), report);
  const grossProfit = metricFromLine('grossProfit', findTotal(roots, PNL_SYNONYMS.grossProfit), report);
  const operatingExpenses = metricFromLine('operatingExpenses', findTotal(roots, PNL_SYNONYMS.operatingExpenses), report);
  const netIncome = metricFromLine('netIncome', findTotal(roots, PNL_SYNONYMS.netIncome, { last: true }), report);

  const metrics: PnlMetrics = {
    revenue,
    cogs,
    grossProfit,
    operatingExpenses,
    netIncome,
    grossMarginPct: marginPct(grossProfit.current, revenue.current),
    netMarginPct: marginPct(netIncome.current, revenue.current),
    priorGrossMarginPct: marginPct(grossProfit.prior, revenue.prior),
    priorNetMarginPct: marginPct(netIncome.prior, revenue.prior),
  };
  const reason = marginReason(revenue, grossProfit, netIncome);
  return reason === undefined ? metrics : { ...metrics, marginReason: reason };
}
