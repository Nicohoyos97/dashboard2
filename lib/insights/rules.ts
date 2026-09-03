// Deterministic insight rules (spec §7). Each rule returns at most one
// insight; generateInsights keeps the five most urgent. Every number in
// `params` is computed here from published figures — Nick only phrases them.
import { variance } from '@/lib/money';
import { daysBetween } from '@/lib/reports/dates';

import { categoryUpMaterial, marginChanged, metricChange, payrollShareUp } from './pnl-rules';
import {
  INSIGHT_LINKS,
  MAX_INSIGHTS,
  SALES_TAX_REMINDER_TYPE,
  SETTLED_REMINDER_STATUSES,
  THRESHOLDS,
  round1,
} from './types';
import type { Insight, InsightInput, InsightSeverity } from './types';

export type { Insight, InsightInput, InsightReminder, InsightRuleKey, InsightSeverity } from './types';
export { INSIGHT_LINKS, MAX_INSIGHTS, THRESHOLDS } from './types';

function revenueUpCollectionsDown(input: InsightInput): Insight | null {
  if (!input.pnl || !input.cash?.prior) return null;
  const revenue = metricChange(input.pnl.current.revenue, input.pnl.prior?.revenue);
  const cashIn = variance(input.cash.current.inCents, input.cash.prior.inCents);
  if (!revenue || revenue.deltaPct === null || cashIn.pct === null) return null;
  if (revenue.deltaPct < THRESHOLDS.collectionsGapMinPct || cashIn.pct > -THRESHOLDS.collectionsGapMinPct) return null;
  return {
    ruleKey: 'revenue_up_collections_down',
    severity: 'warning',
    priority: 2,
    linkPath: INSIGHT_LINKS.overview,
    params: {
      revenueDeltaPct: round1(revenue.deltaPct),
      revenueDeltaCents: revenue.deltaCents,
      cashInDeltaPct: round1(cashIn.pct),
      cashInDeltaCents: cashIn.deltaCents,
    },
  };
}

function liabilitiesOutpacingAssets(input: InsightInput): Insight | null {
  const liabilities = input.balance?.totalLiabilities;
  const assets = input.balance?.totalAssets;
  if (!liabilities || !assets || liabilities.deltaPct === null || assets.deltaPct === null || liabilities.deltaCents === null) return null;
  if (liabilities.deltaCents <= 0 || liabilities.deltaPct - assets.deltaPct < THRESHOLDS.liabilitiesGapPoints) return null;
  return {
    ruleKey: 'liabilities_outpacing_assets',
    severity: 'warning',
    priority: 2,
    linkPath: INSIGHT_LINKS.balanceSheet,
    params: {
      liabilitiesDeltaPct: round1(liabilities.deltaPct),
      assetsDeltaPct: round1(assets.deltaPct),
      liabilitiesDeltaCents: liabilities.deltaCents,
    },
  };
}

function salesTaxDueSoon(input: InsightInput): Insight | null {
  let soonest: { dueDate: string; days: number; amountCents: number | null } | null = null;
  for (const reminder of input.reminders) {
    if (reminder.reminderType !== SALES_TAX_REMINDER_TYPE || SETTLED_REMINDER_STATUSES.includes(reminder.status)) continue;
    const days = daysBetween(input.today, reminder.dueDate);
    if (days === null || days < 0 || days > THRESHOLDS.salesTaxDueDays) continue;
    if (!soonest || days < soonest.days) soonest = { dueDate: reminder.dueDate, days, amountCents: reminder.amountCents };
  }
  if (!soonest) return null;
  const params: Record<string, string | number> = { dueDate: soonest.dueDate, daysUntilDue: soonest.days };
  // The amount is only passed on when the firm recorded one — never estimated.
  if (soonest.amountCents !== null) params.amountCents = soonest.amountCents;
  return {
    ruleKey: 'sales_tax_due_soon',
    severity: soonest.days <= THRESHOLDS.salesTaxCriticalDays ? 'critical' : 'warning',
    priority: 1,
    linkPath: INSIGHT_LINKS.salesTaxes,
    params,
  };
}

function outflowExceededInflow(input: InsightInput): Insight | null {
  const cash = input.cash?.current;
  if (!cash || cash.outCents - cash.inCents < THRESHOLDS.netOutflowMinCents) return null;
  return {
    ruleKey: 'outflow_exceeded_inflow',
    severity: 'warning',
    priority: 1,
    linkPath: INSIGHT_LINKS.overview,
    params: { inCents: cash.inCents, outCents: cash.outCents, netCents: cash.netCents },
  };
}

function reportNeedsReview(input: InsightInput): Insight | null {
  if (input.reportsNeedingReview < 1) return null;
  return {
    ruleKey: 'report_needs_review',
    severity: 'info',
    priority: 4,
    linkPath: INSIGHT_LINKS.overview,
    params: { count: input.reportsNeedingReview },
  };
}

const RULES: ((input: InsightInput) => Insight | null)[] = [
  salesTaxDueSoon,
  outflowExceededInflow,
  revenueUpCollectionsDown,
  liabilitiesOutpacingAssets,
  marginChangedRule,
  payrollShareUpRule,
  categoryUpMaterialRule,
  reportNeedsReview,
];

function marginChangedRule(input: InsightInput): Insight | null {
  return input.pnl ? marginChanged(input.pnl) : null;
}

function payrollShareUpRule(input: InsightInput): Insight | null {
  return input.pnl ? payrollShareUp(input.pnl) : null;
}

function categoryUpMaterialRule(input: InsightInput): Insight | null {
  return input.pnl ? categoryUpMaterial(input.pnl) : null;
}

const SEVERITY_RANK: Record<InsightSeverity, number> = { critical: 0, warning: 1, info: 2 };

/** At most MAX_INSIGHTS, most urgent first (priority, then severity, then rule order). */
export function generateInsights(input: InsightInput): Insight[] {
  return RULES.map((rule) => rule(input))
    .filter((insight): insight is Insight => insight !== null)
    .map((insight, order) => ({ insight, order }))
    .sort(
      (a, b) =>
        a.insight.priority - b.insight.priority ||
        SEVERITY_RANK[a.insight.severity] - SEVERITY_RANK[b.insight.severity] ||
        a.order - b.order,
    )
    .slice(0, MAX_INSIGHTS)
    .map(({ insight }) => insight);
}
