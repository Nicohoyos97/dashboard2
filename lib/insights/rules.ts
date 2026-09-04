// Deterministic insight rules (spec §7). Each rule returns at most one
// insight; generateInsights keeps the five most urgent. Every number in
// `params` is computed here from published figures — Nick only phrases them.
import { daysBetween } from '@/lib/reports/dates';

import { categoryUpMaterial, marginChanged, payrollShareUp } from './pnl-rules';
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
