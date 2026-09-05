// The cover letter's analysis paragraph, derived — never written.
//
// Every figure comes from a total the firm's statement actually printed, and
// every sentence is dropped when the totals it needs are missing: the letter
// says less rather than claiming more. No model is involved and no arithmetic
// happens here beyond the ratios the metric models already computed
// (CLAUDE.md §2.9 — the model never does arithmetic that TypeScript can do).
import type { BalanceSheetMetrics } from './balance-sheet';
import type { PnlMetrics } from './pnl';
import { fillTemplate } from './report-format';
import type { ReportLabels } from './report-labels';
import type { Figure } from './types';

export type AnalysisContext = {
  labels: ReportLabels;
  locale: string;
  /** A total or band figure, symbol included. */
  money: (cents: number | null) => string;
  percent: (value: number | null) => string;
};

export type ExpenseItem = { label: string; cents: number };

const TOP_EXPENSES = 2;

const cents = (figure: Figure | null): number | null => figure?.cents ?? null;

function list(items: readonly string[], locale: string): string {
  try {
    return new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' }).format([...items]);
  } catch {
    return items.join(', ');
  }
}

/** Income · expenses · result, each sentence only when its totals are printed. */
export function pnlAnalysis(
  metrics: PnlMetrics,
  expenses: readonly ExpenseItem[],
  ctx: AnalysisContext,
): string[] {
  const { labels: t, money } = ctx;
  const out: string[] = [];

  const revenue = cents(metrics.revenue.current);
  const cogs = cents(metrics.cogs.current);
  const grossProfit = cents(metrics.grossProfit.current);
  if (revenue !== null) {
    const margin =
      metrics.grossMarginPct === null
        ? ''
        : fillTemplate(t.analysisMargin, { margin: ctx.percent(metrics.grossMarginPct) });
    out.push(
      cogs !== null && grossProfit !== null
        ? fillTemplate(t.analysisIncome, {
            revenue: money(revenue),
            cogs: money(cogs),
            grossProfit: money(grossProfit),
            margin,
          })
        : fillTemplate(t.analysisIncomeNoCogs, { revenue: money(revenue) }),
    );
  }

  const operating = cents(metrics.operatingExpenses.current);
  if (operating !== null) {
    const led = [...expenses]
      .sort((a, b) => b.cents - a.cents)
      .slice(0, TOP_EXPENSES)
      .map((item) => `${item.label} (${money(item.cents)})`);
    out.push(
      led.length > 0
        ? fillTemplate(t.analysisExpensesLed, {
            expenses: money(operating),
            items: list(led, ctx.locale),
          })
        : fillTemplate(t.analysisExpenses, { expenses: money(operating) }),
    );
  }

  const net = cents(metrics.netIncome.current);
  if (net !== null) {
    out.push(
      fillTemplate(net < 0 ? t.analysisNetLoss : t.analysisNetIncome, { netIncome: money(net) }),
    );
  }
  return out;
}

/** Position · liquidity, on the same rule: no printed total, no sentence. */
export function balanceAnalysis(metrics: BalanceSheetMetrics, ctx: AnalysisContext): string[] {
  const { labels: t, money } = ctx;
  const out: string[] = [];

  const assets = cents(metrics.totalAssets.current);
  const liabilities = cents(metrics.totalLiabilities.current);
  const equity = cents(metrics.totalEquity.current);
  if (assets !== null && liabilities !== null && equity !== null) {
    out.push(
      fillTemplate(t.analysisAssets, {
        assets: money(assets),
        liabilities: money(liabilities),
        equity: money(equity),
      }),
    );
  }

  const working = cents(metrics.workingCapital.current);
  if (working !== null && metrics.currentRatio.current !== null) {
    out.push(
      fillTemplate(t.analysisWorkingCapital, {
        workingCapital: money(working),
        currentRatio: metrics.currentRatio.current.toFixed(2),
      }),
    );
  }
  return out;
}
