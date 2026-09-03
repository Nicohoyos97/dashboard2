// Statement tools: Profit & Loss, Balance Sheet, period comparison and the
// expense breakdown. Every figure is a printed total or a deterministic
// derivation from lib/reports; the shaping functions are pure so tests can
// run them on fixture rows without a database.
import { NICK_LIMITS } from '@/lib/ai/nick/config';
import { variance } from '@/lib/money';
import { fromCents } from '@/lib/money';
import { loadPublishedReports, loadReportLines } from '@/lib/portal/load';
import { balanceSheetMetrics } from '@/lib/reports/balance-sheet';
import { PNL_SYNONYMS, pnlMetrics } from '@/lib/reports/pnl';
import { findSection, normalizeName, walk } from '@/lib/reports/sections';
import { buildTree, flattenTree } from '@/lib/reports/tree';
import type { LineNode, ReportRow, ReportType } from '@/lib/reports/types';

import {
  type ShapeContext,
  type ToolContext,
  type ToolResult,
  availablePeriodsOf,
  changeOut,
  citeDerived,
  citeLine,
  metricOut,
  money,
  parsePeriodInput,
  pickReport,
  ratioOut,
  reportOut,
} from './context';
import type { ToolInput } from './schemas';

export function pnlSummary(ctx: ShapeContext, report: ReportRow, roots: readonly LineNode[]) {
  const m = pnlMetrics(report, roots);
  const marginCite = citeDerived(
    ctx,
    report,
    ctx.locale === 'es' ? 'Márgenes (calculados)' : 'Margins (computed)',
  );
  return {
    revenue: metricOut(ctx, report, m.revenue),
    costOfGoodsSold: metricOut(ctx, report, m.cogs),
    grossProfit: metricOut(ctx, report, m.grossProfit),
    operatingExpenses: metricOut(ctx, report, m.operatingExpenses),
    netIncome: metricOut(ctx, report, m.netIncome),
    margins: {
      grossMarginPct: m.grossMarginPct,
      netMarginPct: m.netMarginPct,
      priorGrossMarginPct: m.priorGrossMarginPct,
      priorNetMarginPct: m.priorNetMarginPct,
      cite: marginCite,
      ...(m.marginReason ? { reason: m.marginReason } : {}),
    },
  };
}

export function balanceSummary(ctx: ShapeContext, report: ReportRow, roots: readonly LineNode[]) {
  const m = balanceSheetMetrics(report, roots);
  const wc = ctx.locale === 'es' ? 'Capital de trabajo (calculado)' : 'Working capital (computed)';
  return {
    totalAssets: metricOut(ctx, report, m.totalAssets),
    totalLiabilities: metricOut(ctx, report, m.totalLiabilities),
    totalEquity: metricOut(ctx, report, m.totalEquity),
    currentAssets: metricOut(ctx, report, m.currentAssets),
    currentLiabilities: metricOut(ctx, report, m.currentLiabilities),
    workingCapital: metricOut(ctx, report, m.workingCapital, wc),
    currentRatio: ratioOut(
      ctx,
      report,
      m.currentRatio,
      ctx.locale === 'es' ? 'Razón corriente (calculada)' : 'Current ratio (computed)',
    ),
    debtToAsset: ratioOut(
      ctx,
      report,
      m.debtToAsset,
      ctx.locale === 'es' ? 'Deuda sobre activos (calculada)' : 'Debt-to-asset (computed)',
    ),
    accountingEquationBalanced: m.equationOk,
  };
}

function lineOut(ctx: ShapeContext, report: ReportRow, line: LineNode) {
  return {
    name: line.accountName,
    section: line.section,
    depth: line.depth,
    isTotal: line.isTotal,
    isSection: line.isSection,
    current:
      line.currentCents === null
        ? null
        : {
            amount: fromCents(line.currentCents),
            formatted: money(ctx, line.currentCents, report.currency),
          },
    prior:
      line.priorCents === null
        ? null
        : {
            amount: fromCents(line.priorCents),
            formatted: money(ctx, line.priorCents, report.currency),
          },
    change: changeOut(ctx, report, line.deltaCents, line.deltaPct),
    page: line.pageNumber,
    cite: citeLine(ctx, report, line),
  };
}

/** Lines in printed order (optionally only those matching `query`), capped so a long statement stays a small result. */
export function statementLines(
  ctx: ShapeContext,
  report: ReportRow,
  roots: readonly LineNode[],
  query: string | null,
) {
  const wanted = query ? normalizeName(query) : '';
  const flat = flattenTree(roots, wanted ? { query: wanted } : {});
  const selected = wanted
    ? flat.filter((line) => normalizeName(line.accountName).includes(wanted) || line.isTotal)
    : flat;
  const limited = selected.slice(0, NICK_LIMITS.maxStatementLines);
  return {
    lines: limited.map((line) => lineOut(ctx, report, line)),
    truncated: limited.length < selected.length,
    totalLines: flat.length,
  };
}

type Leaf = { node: LineNode; cents: number };

function expenseLeaves(section: LineNode | null): Leaf[] {
  const leaves: Leaf[] = [];
  if (!section) return leaves;
  walk(section.children, (node) => {
    if (node.isTotal || node.isSection || node.children.length > 0) return;
    if (node.currentCents !== null && node.currentCents > 0)
      leaves.push({ node, cents: node.currentCents });
  });
  return leaves;
}

/** Largest operating expense lines with their share of the printed operating-expense total (or of the lines' sum when no total is printed). */
export function expenseBreakdown(
  ctx: ShapeContext,
  report: ReportRow,
  roots: readonly LineNode[],
  limit: number,
) {
  const leaves = expenseLeaves(findSection(roots, PNL_SYNONYMS.operatingExpenses)).sort(
    (a, b) => b.cents - a.cents,
  );
  const printedTotal = pnlMetrics(report, roots).operatingExpenses.current;
  const sum = leaves.reduce((acc, leaf) => acc + leaf.cents, 0);
  const denominator = printedTotal?.cents ?? sum;
  const top = leaves.slice(0, Math.max(1, Math.min(limit, 25)));
  const rest = leaves.slice(top.length).reduce((acc, leaf) => acc + leaf.cents, 0);
  const share = (cents: number) =>
    denominator > 0 ? Math.round((cents / denominator) * 1000) / 10 : null;
  return {
    basis: printedTotal ? 'printed_operating_expenses_total' : 'sum_of_expense_lines',
    total: {
      amount: fromCents(denominator),
      formatted: money(ctx, denominator, report.currency),
      cite: printedTotal?.lineId
        ? citeLine(ctx, report, {
            id: printedTotal.lineId,
            pageNumber: printedTotal.page,
            accountName: printedTotal.label,
          })
        : citeDerived(
            ctx,
            report,
            ctx.locale === 'es' ? 'Suma de gastos (calculada)' : 'Sum of expense lines (computed)',
          ),
    },
    categories: top.map(({ node, cents }) => ({
      name: node.accountName,
      amount: fromCents(cents),
      formatted: money(ctx, cents, report.currency),
      sharePct: share(cents),
      prior:
        node.priorCents === null
          ? null
          : {
              amount: fromCents(node.priorCents),
              formatted: money(ctx, node.priorCents, report.currency),
            },
      change: changeOut(ctx, report, node.deltaCents, node.deltaPct),
      cite: citeLine(ctx, report, node),
    })),
    other:
      rest > 0
        ? {
            amount: fromCents(rest),
            formatted: money(ctx, rest, report.currency),
            sharePct: share(rest),
            lines: leaves.length - top.length,
          }
        : null,
  };
}

async function loadStatement(ctx: ToolContext, type: ReportType, requested: string | null) {
  const reports = (await loadPublishedReports(ctx.supabase, ctx.entityId)).filter(
    (r) => r.reportType === type,
  );
  const report = pickReport(ctx, reports, requested);
  if (!report) {
    return {
      report: null,
      roots: [],
      reports,
      unavailable: {
        reason: reports.length === 0 ? 'no_published_report' : 'period_not_published',
        availablePeriods: availablePeriodsOf(reports, ctx.locale),
      },
    };
  }
  const roots = buildTree(await loadReportLines(ctx.supabase, ctx.entityId, report.id));
  return { report, roots, reports, unavailable: null };
}

export async function getProfitAndLoss(
  ctx: ToolContext,
  input: ToolInput<'get_profit_and_loss'>,
): Promise<ToolResult> {
  const { report, roots, unavailable } = await loadStatement(ctx, 'profit_and_loss', input.period);
  if (!report) return { available: false, ...unavailable };
  const summary = pnlSummary(ctx, report, roots);
  const wantLines = input.detail === 'lines' || input.query !== null;
  return {
    available: true,
    report: reportOut(ctx, report),
    metrics: summary,
    ...(wantLines ? statementLines(ctx, report, roots, input.query) : {}),
  };
}

export async function getBalanceSheet(
  ctx: ToolContext,
  input: ToolInput<'get_balance_sheet'>,
): Promise<ToolResult> {
  const { report, roots, unavailable } = await loadStatement(ctx, 'balance_sheet', input.period);
  if (!report) return { available: false, ...unavailable };
  const wantLines = input.detail === 'lines' || input.query !== null;
  return {
    available: true,
    report: reportOut(ctx, report),
    metrics: balanceSummary(ctx, report, roots),
    ...(wantLines ? statementLines(ctx, report, roots, input.query) : {}),
  };
}

export async function getExpenseBreakdown(
  ctx: ToolContext,
  input: ToolInput<'get_expense_breakdown'>,
): Promise<ToolResult> {
  const { report, roots, unavailable } = await loadStatement(ctx, 'profit_and_loss', input.period);
  if (!report) return { available: false, ...unavailable };
  return {
    available: true,
    report: reportOut(ctx, report),
    ...expenseBreakdown(ctx, report, roots, input.limit ?? 8),
  };
}

type Side = { report: ReportRow; roots: LineNode[] };

function compareMetric(
  ctx: ShapeContext,
  a: Side,
  b: Side,
  key: string,
  pick: (side: Side) => {
    current: { cents: number; lineId: string | null; page: number | null; label: string } | null;
  },
) {
  const first = pick(a).current;
  const second = pick(b).current;
  const out = {
    metric: key,
    periodA: first
      ? {
          amount: fromCents(first.cents),
          formatted: money(ctx, first.cents, a.report.currency),
          cite: first.lineId
            ? citeLine(ctx, a.report, {
                id: first.lineId,
                pageNumber: first.page,
                accountName: first.label,
              })
            : citeDerived(ctx, a.report, first.label),
        }
      : null,
    periodB: second
      ? {
          amount: fromCents(second.cents),
          formatted: money(ctx, second.cents, b.report.currency),
          cite: second.lineId
            ? citeLine(ctx, b.report, {
                id: second.lineId,
                pageNumber: second.page,
                accountName: second.label,
              })
            : citeDerived(ctx, b.report, second.label),
        }
      : null,
  };
  if (!first || !second) return { ...out, change: null };
  const { deltaCents, pct } = variance(second.cents, first.cents);
  return { ...out, change: changeOut(ctx, b.report, deltaCents, pct) };
}

export async function compareFinancialPeriods(
  ctx: ToolContext,
  input: ToolInput<'compare_financial_periods'>,
): Promise<ToolResult> {
  const rangeA = parsePeriodInput(input.period_a);
  const rangeB = parsePeriodInput(input.period_b);
  const reports = (await loadPublishedReports(ctx.supabase, ctx.entityId)).filter(
    (r) => r.reportType === input.statement,
  );
  const find = (range: { start: string; end: string } | null) =>
    range
      ? (reports.find((r) => r.periodStart === range.start && r.periodEnd === range.end) ?? null)
      : null;
  const reportA = find(rangeA);
  const reportB = find(rangeB);
  if (!reportA || !reportB) {
    return {
      available: false,
      reason: 'period_not_published',
      missing: [...(reportA ? [] : ['period_a']), ...(reportB ? [] : ['period_b'])],
      availablePeriods: availablePeriodsOf(reports, ctx.locale),
    };
  }
  const [linesA, linesB] = await Promise.all([
    loadReportLines(ctx.supabase, ctx.entityId, reportA.id),
    loadReportLines(ctx.supabase, ctx.entityId, reportB.id),
  ]);
  const a: Side = { report: reportA, roots: buildTree(linesA) };
  const b: Side = { report: reportB, roots: buildTree(linesB) };
  const rows =
    input.statement === 'profit_and_loss'
      ? (['revenue', 'cogs', 'grossProfit', 'operatingExpenses', 'netIncome'] as const).map((key) =>
          compareMetric(ctx, a, b, key, (side) => pnlMetrics(side.report, side.roots)[key]),
        )
      : (
          [
            'totalAssets',
            'totalLiabilities',
            'totalEquity',
            'currentAssets',
            'currentLiabilities',
            'workingCapital',
          ] as const
        ).map((key) =>
          compareMetric(
            ctx,
            a,
            b,
            key,
            (side) => balanceSheetMetrics(side.report, side.roots)[key],
          ),
        );
  return {
    available: true,
    statement: input.statement,
    periodA: reportOut(ctx, reportA),
    periodB: reportOut(ctx, reportB),
    changeDirection: 'periodB minus periodA',
    metrics: rows,
  };
}
