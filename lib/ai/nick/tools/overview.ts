// Overview, obligations and the report inventory. Cash comes from published
// bank statements and only for periods every account covers; revenue and net
// income come from the Profit & Loss — the same rules as the Overview page.
import { citationLabel } from '@/lib/ai/nick/citations';
import { fromCents, variance } from '@/lib/money';
import {
  loadPortalEntitySettings,
  loadPublishedBankStatements,
  loadPublishedBankTransactions,
  loadPublishedDocuments,
  loadPublishedReports,
  loadReminders,
  loadReportLines,
} from '@/lib/portal/load';
import { effectiveReminderStatus } from '@/lib/reminders/status';
import { cashByMonth, cashComparison } from '@/lib/reports/cash';
import { daysBetween } from '@/lib/reports/dates';
import { availablePeriods, bankAccountsCoverPeriod, priorPeriod } from '@/lib/reports/periods';
import { pnlMetrics } from '@/lib/reports/pnl';
import { buildTree } from '@/lib/reports/tree';
import type { Metric, ReportRow } from '@/lib/reports/types';

import {
  type ShapeContext,
  type ToolContext,
  type ToolResult,
  figureOut,
  label,
  money,
  parsePeriodInput,
  periodOf,
  periodText,
  reportOut,
} from './context';
import type { ToolInput } from './schemas';

type Range = { start: string; end: string };

function exactReport(
  reports: readonly ReportRow[],
  type: ReportRow['reportType'],
  range: Range,
): ReportRow | null {
  return (
    reports.find(
      (r) => r.reportType === type && r.periodStart === range.start && r.periodEnd === range.end,
    ) ?? null
  );
}

function citeBank(ctx: ShapeContext, range: Range): string {
  return ctx.registry.add({
    label: citationLabel([
      label(ctx.locale, 'bank'),
      periodText(range.start, range.end, ctx.locale),
    ]),
    reportId: null,
    documentVersionId: null,
    lineId: null,
    page: null,
    periodStart: range.start,
    periodEnd: range.end,
    source: 'firm_document',
    href: `/dashboard?period=${range.start}_${range.end}`,
  });
}

/** A P&L headline with its change: the statement's own comparative column, else the prior period's published report. */
function headline(
  ctx: ShapeContext,
  report: ReportRow | null,
  metric: Metric | undefined,
  priorReport: ReportRow | null,
  priorMetric: Metric | undefined,
) {
  if (!report || !metric) return { available: false, reason: 'no_published_report' };
  const current = figureOut(ctx, report, metric.current);
  if (!current) return { available: false, reason: metric.reason ?? 'no_printed_total' };
  if (metric.prior && metric.deltaCents !== null) {
    return {
      available: true,
      current,
      prior: figureOut(ctx, report, metric.prior),
      change: {
        amount: fromCents(metric.deltaCents),
        formatted: money(ctx, metric.deltaCents, report.currency),
        pct: metric.deltaPct === null ? null : Math.round(metric.deltaPct * 10) / 10,
      },
      comparedTo: 'comparative_column',
    };
  }
  const priorFigure =
    priorReport && priorMetric?.current ? figureOut(ctx, priorReport, priorMetric.current) : null;
  if (!priorFigure || !priorMetric?.current || !metric.current)
    return { available: true, current, prior: null, change: null, reason: 'no_prior_period' };
  const { deltaCents, pct } = variance(metric.current.cents, priorMetric.current.cents);
  return {
    available: true,
    current,
    prior: priorFigure,
    change: {
      amount: fromCents(deltaCents),
      formatted: money(ctx, deltaCents, report.currency),
      pct: pct === null ? null : Math.round(pct * 10) / 10,
    },
    comparedTo: 'prior_period_report',
  };
}

export async function getOverviewMetrics(
  ctx: ToolContext,
  input: ToolInput<'get_overview_metrics'>,
): Promise<ToolResult> {
  const [settings, reports, statements] = await Promise.all([
    loadPortalEntitySettings(ctx.supabase, ctx.entityId),
    loadPublishedReports(ctx.supabase, ctx.entityId),
    loadPublishedBankStatements(ctx.supabase, ctx.entityId),
  ]);
  const periods = availablePeriods(
    reports,
    statements.filter((s) => s.currency === settings.currency),
    { locale: ctx.locale },
  ).filter((p) => p.sources.some((s) => s === 'pnl' || s === 'bank'));
  const wanted = parsePeriodInput(input.period) ?? ctx.context.period;
  const selected =
    (wanted && periods.find((p) => p.start === wanted.start && p.end === wanted.end)) ??
    (input.period ? null : periods[0]) ??
    null;
  const availableOut = periods.map((p) => ({
    period: `${p.start}_${p.end}`,
    label: p.label,
    sources: p.sources,
  }));
  if (!selected)
    return {
      available: false,
      reason: periods.length === 0 ? 'no_published_data' : 'period_not_published',
      availablePeriods: availableOut,
    };

  const pnlReport = exactReport(reports, 'profit_and_loss', selected);
  const prior = priorPeriod(selected, ctx.locale);
  const priorPnlReport = prior ? exactReport(reports, 'profit_and_loss', prior) : null;
  const currency = pnlReport?.currency ?? settings.currency;
  const spans = statements
    .filter((s) => s.currency === currency)
    .map((s) => ({ bankAccountId: s.bankAccountId, start: s.periodStart, end: s.periodEnd }));
  const cashCovered = bankAccountsCoverPeriod(spans, selected);
  const priorCashCovered = prior ? bankAccountsCoverPeriod(spans, prior) : false;

  const [lines, priorLines, transactions, priorTransactions] = await Promise.all([
    pnlReport ? loadReportLines(ctx.supabase, ctx.entityId, pnlReport.id) : Promise.resolve([]),
    priorPnlReport
      ? loadReportLines(ctx.supabase, ctx.entityId, priorPnlReport.id)
      : Promise.resolve([]),
    cashCovered
      ? loadPublishedBankTransactions(ctx.supabase, ctx.entityId, currency, selected)
      : Promise.resolve([]),
    prior && priorCashCovered
      ? loadPublishedBankTransactions(ctx.supabase, ctx.entityId, currency, prior)
      : Promise.resolve([]),
  ]);
  const pnl = pnlReport ? pnlMetrics(pnlReport, buildTree(lines)) : null;
  const priorPnl = priorPnlReport ? pnlMetrics(priorPnlReport, buildTree(priorLines)) : null;

  let cash: ToolResult;
  if (!cashCovered) {
    cash = {
      available: false,
      reason: 'incomplete_bank_coverage',
      note: 'Published bank statements do not cover every day of the period for every account; cash totals are not shown for a partial period.',
    };
  } else {
    const comparison = cashComparison(
      cashByMonth(transactions, selected),
      prior && priorCashCovered ? cashByMonth(priorTransactions, prior) : [],
    );
    const cite = citeBank(ctx, selected);
    const priorCite = prior && priorCashCovered ? citeBank(ctx, prior) : null;
    const out = (metric: (typeof comparison)['cashIn']) => ({
      current: {
        amount: fromCents(metric.currentCents),
        formatted: money(ctx, metric.currentCents, currency),
        cite,
      },
      prior:
        metric.priorCents === null || !priorCite
          ? null
          : {
              amount: fromCents(metric.priorCents),
              formatted: money(ctx, metric.priorCents, currency),
              cite: priorCite,
            },
      change:
        metric.deltaCents === null
          ? null
          : {
              amount: fromCents(metric.deltaCents),
              formatted: money(ctx, metric.deltaCents, currency),
              pct: metric.deltaPct === null ? null : Math.round(metric.deltaPct * 10) / 10,
            },
    });
    cash = {
      available: true,
      source: 'bank_statements',
      cashIn: out(comparison.cashIn),
      cashOut: out(comparison.cashOut),
      netCashFlow: out(comparison.netCash),
    };
  }

  return {
    available: true,
    period: { start: selected.start, end: selected.end, label: selected.label },
    priorPeriod: prior ? { start: prior.start, end: prior.end, label: prior.label } : null,
    currency,
    cash,
    profitAndLoss: pnlReport ? reportOut(ctx, pnlReport) : null,
    revenue: {
      source: 'profit_and_loss',
      ...headline(ctx, pnlReport, pnl?.revenue, priorPnlReport, priorPnl?.revenue),
    },
    netIncome: {
      source: 'profit_and_loss',
      ...headline(ctx, pnlReport, pnl?.netIncome, priorPnlReport, priorPnl?.netIncome),
    },
    availablePeriods: availableOut,
  };
}

const SETTLED = new Set(['paid', 'completed']);
const MAX_REMINDERS = 50;

export async function getUpcomingObligations(
  ctx: ToolContext,
  input: ToolInput<'get_upcoming_obligations'>,
): Promise<ToolResult> {
  const reminders = await loadReminders(ctx.supabase, ctx.entityId);
  const horizon = Math.max(1, Math.min(input.days_ahead ?? 90, 730));
  const items = reminders
    .map((r) => ({
      ...r,
      effective: effectiveReminderStatus(r.status, r.dueDate, ctx.today),
      days: daysBetween(ctx.today, r.dueDate),
    }))
    .filter(
      (r) =>
        (input.include_settled || !SETTLED.has(r.effective)) &&
        (r.days === null || r.days <= horizon),
    )
    .slice(0, MAX_REMINDERS)
    .map((r) => ({
      title: r.title,
      type: r.reminderType,
      dueDate: r.dueDate,
      daysUntilDue: r.days,
      status: r.effective,
      amount:
        r.amountCents === null
          ? null
          : { amount: fromCents(r.amountCents), formatted: money(ctx, r.amountCents) },
      responsible: r.responsible,
      actionRequired: r.actionRequired,
      source: r.source,
      cite: ctx.registry.add({
        label: citationLabel([label(ctx.locale, 'reminder'), r.title, r.dueDate]),
        reportId: null,
        documentVersionId: null,
        lineId: null,
        page: null,
        periodStart: null,
        periodEnd: null,
        source: r.source === 'firm_entry' ? 'firm_entry' : 'firm_document',
        href: '/dashboard#reminders',
      }),
    }));
  return {
    available: true,
    today: ctx.today,
    horizonDays: horizon,
    count: items.length,
    obligations: items,
  };
}

const TAX_DOCUMENT_TYPES = new Set([
  'sales_tax_filing',
  'sales_tax_payment',
  'income_tax_document',
]);
const MAX_LISTED = 40;

export async function listAvailableReports(
  ctx: ToolContext,
  input: ToolInput<'list_available_reports'>,
): Promise<ToolResult> {
  const [reports, statements, documents] = await Promise.all([
    loadPublishedReports(ctx.supabase, ctx.entityId),
    loadPublishedBankStatements(ctx.supabase, ctx.entityId),
    loadPublishedDocuments(ctx.supabase, ctx.entityId),
  ]);
  const filter = input.report_type;
  const statementRows = reports
    .filter((r) => !filter || filter === r.reportType)
    .slice(0, MAX_LISTED)
    .map((r) => reportOut(ctx, r));
  const bankRows =
    !filter || filter === 'bank_statement'
      ? statements.slice(-MAX_LISTED).map((s) => ({
          statementId: s.id,
          period: periodOf(s, ctx.locale),
          currency: s.currency,
        }))
      : [];
  const documentRows = documents
    .filter((d) => {
      if (!filter) return true;
      if (filter === 'tax') return TAX_DOCUMENT_TYPES.has(d.documentType);
      if (filter === 'other')
        return (
          !TAX_DOCUMENT_TYPES.has(d.documentType) &&
          !['profit_and_loss', 'balance_sheet', 'bank_statement'].includes(d.documentType)
        );
      return d.documentType === filter;
    })
    .slice(0, MAX_LISTED)
    .map((d) => ({
      documentVersionId: d.currentVersionId,
      title: d.title,
      type: d.documentType,
      period:
        d.periodStart && d.periodEnd
          ? periodOf({ periodStart: d.periodStart, periodEnd: d.periodEnd }, ctx.locale)
          : null,
      publishedAt: d.publishedAt,
    }));
  return {
    available: true,
    statements: statementRows,
    bankStatements: bankRows,
    documents: documentRows,
    note: 'Use documentVersionId with get_report_download_link and reportId with create_financial_export.',
  };
}
