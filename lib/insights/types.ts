// Contract of the deterministic insight engine (spec §7 Overview → Insights).
// A rule decides whether an insight exists; the UI renders the sentence from
// `ruleKey` + `params`, and Nick may only rephrase it. No prose lives here.
import type { BalanceSheetMetrics } from '@/lib/reports/balance-sheet';
import type { CashTotals, MonthCash } from '@/lib/reports/cash';
import type { PnlMetrics } from '@/lib/reports/pnl';
import type { LineNode } from '@/lib/reports/types';

export type InsightRuleKey =
  | 'revenue_up_collections_down'
  | 'payroll_share_up'
  | 'category_up_material'
  | 'liabilities_outpacing_assets'
  | 'sales_tax_due_soon'
  | 'outflow_exceeded_inflow'
  | 'margin_changed'
  | 'report_needs_review';

export type InsightSeverity = 'info' | 'warning' | 'critical';

export type Insight = {
  ruleKey: InsightRuleKey;
  severity: InsightSeverity;
  params: Record<string, string | number>;
  linkPath: string;
  /** 1 = most urgent. Ties break on severity, then on rule order. */
  priority: number;
};

/** Shape of `reminders` rows as lib/portal/load.ts returns them (extra fields are ignored). */
export type InsightReminder = {
  reminderType: string;
  status: string;
  dueDate: string;
  amountCents: number | null;
};

export type PnlInput = {
  current: PnlMetrics;
  /** Metrics of the previous period's own report, for statements without a comparative column. */
  prior?: PnlMetrics | undefined;
  /** Statement tree of the current report — needed by the payroll and category rules. */
  lines?: readonly LineNode[] | undefined;
  /** Tree of the prior report; used only when the current lines carry no comparative column. */
  priorLines?: readonly LineNode[] | undefined;
};

export type CashInput = {
  current: CashTotals;
  prior?: CashTotals | undefined;
  months?: readonly MonthCash[] | undefined;
};

export type InsightInput = {
  pnl?: PnlInput | undefined;
  cash?: CashInput | undefined;
  balance?: BalanceSheetMetrics | undefined;
  reminders: readonly InsightReminder[];
  reportsNeedingReview: number;
  /** ISO date the rules evaluate against (injected so tests and jobs are deterministic). */
  today: string;
};

export const MAX_INSIGHTS = 5;

/** Every threshold in one place so the firm can tune them without reading rule code. */
export const THRESHOLDS = {
  /** Revenue up at least this % while cash in fell at least this %: sales are not being collected. */
  collectionsGapMinPct: 1,
  /** Payroll as a share of revenue rose by at least this many percentage points. */
  payrollSharePoints: 3,
  /** An expense line grew by at least this % … */
  categoryUpPct: 20,
  /** … and by at least this many cents ($500), so small accounts do not trigger it. */
  categoryUpMinCents: 50_000,
  /** Liabilities grew at least this many percentage points faster than assets. */
  liabilitiesGapPoints: 5,
  /** A sales-tax deadline within this many days is "due soon" … */
  salesTaxDueDays: 14,
  /** … and within this many days is critical. */
  salesTaxCriticalDays: 3,
  /** Cash out exceeded cash in by at least this many cents (any shortfall counts). */
  netOutflowMinCents: 1,
  /** Gross or net margin moved by at least this many percentage points. */
  marginPoints: 5,
} as const;

/** Locale-less portal paths (lib/nav.ts); the UI prefixes the locale. */
export const INSIGHT_LINKS = {
  overview: '/dashboard',
  pnl: '/statements/profit-and-loss',
  balanceSheet: '/statements/balance-sheet',
  // Phase 3 links to the reminder supporting the rule. Phase 5 can point this
  // at the dedicated Sales Taxes page once that route is live.
  salesTaxes: '/dashboard#reminders',
} as const;

export const SALES_TAX_REMINDER_TYPE = 'sales_tax_deadline';
export const SETTLED_REMINDER_STATUSES: readonly string[] = ['paid', 'completed'];

export function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
