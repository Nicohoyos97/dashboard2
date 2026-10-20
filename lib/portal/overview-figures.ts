// The Overview's Profit & Loss figures — the four cards, the income-vs-expense
// chart, where the money went, and what the insight rules read — for one
// published statement or for a range added up from several. The page draws
// the same thing either way (app/[locale]/(dashboard)/dashboard/page.tsx).
import 'server-only';

import type { InsightPeriod } from '@/lib/insights/periods';
import type { PnlInput } from '@/lib/insights/types';
import { compositionLinks, ledgerLinks } from '@/lib/ledger/links';
import { type PublishedLedger, ledgerDetailFrom, loadLedgerAccounts } from '@/lib/ledger/load';
import { type BalanceSheetMetrics, balanceSheetMetrics } from '@/lib/reports/balance-sheet';
import { type PeriodRange, periodKind, periodLabel, priorPeriod } from '@/lib/reports/periods';
import { PNL_SYNONYMS, pnlMetrics } from '@/lib/reports/pnl';
import { findSection } from '@/lib/reports/sections';
import { buildTree } from '@/lib/reports/tree';
import type { Metric, ReportRow } from '@/lib/reports/types';
import type { createClient } from '@/lib/supabase/server';
import { formatPeriodCompact } from '@/lib/utils/dates';

import { loadReportLinesFor } from './load';
import { periodParam } from './period-param';
import { rangeFigures, rangeSpark } from './range-figures';
import { coveredRange } from './range-statement';
import { loadRangeView, rangeNotice } from './report-period';
import { leafItems } from './statement-page';

type Db = Awaited<ReturnType<typeof createClient>>;

/** How many published P&L periods the headline sparklines run over. */
const PNL_TREND_LIMIT = 6;

export const CARD_KEYS = ['revenue', 'grossProfit', 'operatingExpenses', 'netIncome'] as const;
export type CardKey = (typeof CARD_KEYS)[number];

// Which figure the delta was measured against. The statement's own comparative
// column and the previous published period are different periods, and labelling
// one with the other's name is how "+12.0% vs Jul–Dec 2025" appeared over a
// year-over-year comparison. Nick already distinguishes the two.
export type OverviewCard = {
  cents: number | null;
  deltaCents: number | null;
  deltaPct: number | null;
  /** The period the delta is measured against, named for the reader. */
  comparedWith: string;
  trend: number[];
};

export type OverviewFigures = {
  currency: string;
  /** The days the figures cover — a range cut to the published days is the cut one. */
  range: PeriodRange;
  /** The period in the greeting: "Sep 2026", "Q3 2026", "Aug 15 – Sep 15, 2026". */
  label: string;
  cards: Record<CardKey, OverviewCard>;
  /** Where the figures came from, for the cards' "how is this calculated". */
  source: 'document' | 'entry' | 'range' | 'range_ledger';
  incomeExpense: { label: string; incomeCents: number | null; expenseCents: number | null }[];
  expenses: { label: string; cents: number; href?: string }[];
  /** What the insight rules read for the period on screen, and the periods before it. */
  pnl: PnlInput | undefined;
  earlier: InsightPeriod[];
  balance: BalanceSheetMetrics | null;
  /** The period Nick is told the page is about: only a published statement's. */
  nickPeriod: string | undefined;
  /** Why a range shows what it shows, or why it shows nothing. */
  notice: string | null;
};

type Context = {
  supabase: Db;
  entityId: string;
  /** Every published statement, newest first. */
  reports: readonly ReportRow[];
  ledgers: readonly PublishedLedger[];
  currency: string;
  /** Only a client with the Balance Sheet add-on: without it no insight may read one. */
  balanceSheet: boolean;
  locale: string;
  /** The Overview's translator, for the period names and the range notice. */
  t: (key: string, values?: Record<string, string>) => string;
};

function card(metric: Metric, prior: Metric | undefined, labels: { column: string; prior: string }, trend: (delta: { cents: number | null; deltaCents: number | null }) => number[]): OverviewCard {
  const cents = metric.current?.cents ?? null;
  const done = (deltaCents: number | null, deltaPct: number | null, comparedWith: string): OverviewCard => ({
    cents,
    deltaCents,
    deltaPct,
    comparedWith,
    trend: trend({ cents, deltaCents }),
  });
  if (cents === null) return done(null, null, labels.prior);
  if (metric.deltaCents !== null) return done(metric.deltaCents, metric.deltaPct, labels.column);
  const before = prior?.current?.cents;
  if (before === null || before === undefined) return done(null, null, labels.prior);
  const deltaCents = cents - before;
  return done(deltaCents, before === 0 ? null : (deltaCents / Math.abs(before)) * 100, labels.prior);
}

/** The two real figures a delta compares, when no series of periods exists. */
function priorAndCurrent({ cents, deltaCents }: { cents: number | null; deltaCents: number | null }): number[] {
  return cents === null || deltaCents === null ? [] : [cents - deltaCents, cents];
}

/** The balance sheet the insight rules may read: the latest one on or before the period's end. */
function balanceFor(context: Context, end: string): ReportRow | null {
  return context.balanceSheet
    ? (context.reports.find((report) => report.reportType === 'balance_sheet' && report.periodEnd <= end) ?? null)
    : null;
}

/** One published Profit & Loss, compared and trended as it always was. */
export async function overviewFromReport(context: Context, report: ReportRow): Promise<OverviewFigures> {
  const { supabase, entityId, reports, locale, t } = context;
  const selected = { start: report.periodStart, end: report.periodEnd };
  const exact = (range: PeriodRange) =>
    reports.find((r) => r.reportType === 'profit_and_loss' && r.periodStart === range.start && r.periodEnd === range.end) ?? null;
  const priorRange = priorPeriod(selected, locale);
  const priorReport = priorRange ? exact(priorRange) : null;
  const balanceReport = balanceFor(context, selected.end);

  // The headline sparklines run over the published P&Ls of the same kind as the
  // selected period, oldest first — a monthly view trends months, an annual one
  // trends years, so the shape never mixes granularities (spec §3).
  const kind = periodKind(selected.start, selected.end);
  const trendReports = reports
    .filter((r) => r.reportType === 'profit_and_loss' && r.periodEnd <= selected.end && periodKind(r.periodStart, r.periodEnd) === kind)
    .slice(0, PNL_TREND_LIMIT)
    .reverse();

  // Every statement's lines are read once, and the month's ledger accounts beside them.
  const ids = [...new Set([report.id, priorReport?.id, balanceReport?.id, ...trendReports.map((r) => r.id)].filter((id): id is string => id !== undefined))];
  const [linesById, ledgerAccounts] = await Promise.all([
    loadReportLinesFor(supabase, entityId, ids),
    loadLedgerAccounts(supabase, entityId, report, context.ledgers),
  ]);
  const treeOf = (r: ReportRow | null) => buildTree(r ? (linesById.get(r.id) ?? []) : []);
  const roots = treeOf(report);
  const priorRoots = treeOf(priorReport);
  const current = pnlMetrics(report, roots);
  const prior = priorReport ? pnlMetrics(priorReport, priorRoots) : null;
  const trendTrees = trendReports.map(treeOf);
  const trend = trendReports.map((r, index) => pnlMetrics(r, trendTrees[index] ?? []));

  // A statement's comparative column names its own period; when it does not,
  // say so rather than borrowing the previous period's name.
  const labels = {
    column: report.comparativeStart && report.comparativeEnd ? formatPeriodCompact(report.comparativeStart, report.comparativeEnd, locale) : t('priorColumn'),
    prior: priorRange?.label ?? periodLabel(selected.start, selected.end, kind, locale),
  };
  // A period whose statement does not print a total contributes nothing rather
  // than a zero, so a gap never reads as a collapse to nil.
  const series = (key: CardKey) => (delta: { cents: number | null; deltaCents: number | null }) => {
    const points = trend.flatMap((m) => {
      const cents = m[key].current?.cents;
      return cents === undefined || cents === null ? [] : [cents];
    });
    return points.length === trend.length && points.length >= 2 ? points : priorAndCurrent(delta);
  };
  const cards = Object.fromEntries(CARD_KEYS.map((key) => [key, card(current[key], prior?.[key], labels, series(key))])) as Record<CardKey, OverviewCard>;

  // Each bar opens its account's transactions on Expenses when the month has a General Ledger.
  const links = compositionLinks(roots, ledgerLinks(roots, ledgerDetailFrom(ledgerAccounts, roots)));
  return {
    currency: report.currency,
    range: selected,
    label: periodLabel(selected.start, selected.end, kind, locale),
    cards,
    source: report.source === 'firm_entry' ? 'entry' : 'document',
    // periodLabel, not the full range: "May 2026" fits an axis tick where
    // "May 1, 2026 – May 31, 2026" would crowd every other label off it.
    incomeExpense: trendReports.flatMap((r, index) => {
      const income = trend[index]?.revenue.current?.cents ?? null;
      const expense = trend[index]?.operatingExpenses.current?.cents ?? null;
      return income === null && expense === null ? [] : [{ label: periodLabel(r.periodStart, r.periodEnd, kind, locale), incomeCents: income, expenseCents: expense }];
    }),
    expenses: withLinks(leafItems(findSection(roots, PNL_SYNONYMS.operatingExpenses)), links),
    pnl: { current, lines: roots, ...(prior ? { prior, priorLines: priorRoots } : {}) },
    // Insights run over the last few published periods too: the earlier ones
    // get the statement rules (their balance figures are not loaded).
    earlier: trendReports.flatMap((r, index) => {
      const metrics = trend[index];
      if (!metrics || r.periodEnd >= selected.end) return [];
      return [{ start: r.periodStart, end: r.periodEnd, label: periodLabel(r.periodStart, r.periodEnd, kind, locale), metrics, lines: trendTrees[index] ?? [] }];
    }),
    balance: balanceReport ? balanceSheetMetrics(balanceReport, treeOf(balanceReport)) : null,
    nickPeriod: periodParam(selected),
    notice: null,
  };
}

/** Dates no single statement covers, added up (lib/reports/range.ts) and compared with the same length before. */
export async function overviewFromRange(context: Context, requested: PeriodRange): Promise<OverviewFigures> {
  const { supabase, entityId, locale, t } = context;
  const rangeContext = { reports: context.reports, ledgers: context.ledgers, currency: context.currency };
  const covered = coveredRange(rangeContext, requested);
  const balanceReport = covered ? balanceFor(context, covered.end) : null;
  const [view, balanceLines] = await Promise.all([
    loadRangeView(supabase, entityId, rangeContext, requested),
    balanceReport ? loadReportLinesFor(supabase, entityId, [balanceReport.id]) : Promise.resolve(null),
  ]);
  const notice = rangeNotice(view, t, locale);
  const label = (range: PeriodRange) => periodLabel(range.start, range.end, periodKind(range.start, range.end), locale);

  if (!view.ok) {
    const none: OverviewCard = { cents: null, deltaCents: null, deltaPct: null, comparedWith: '', trend: [] };
    return {
      currency: context.currency,
      range: requested,
      label: label(requested),
      cards: { revenue: none, grossProfit: none, operatingExpenses: none, netIncome: none },
      source: 'range',
      incomeExpense: [],
      expenses: [],
      pnl: undefined,
      earlier: [],
      balance: null,
      nickPeriod: undefined,
      notice,
    };
  }

  const figures = rangeFigures(view.statement, view.prior, periodParam(requested));
  const { report } = figures;
  const priorLabel = report.comparativeStart && report.comparativeEnd ? label({ start: report.comparativeStart, end: report.comparativeEnd }) : '';
  const cards = Object.fromEntries(
    CARD_KEYS.map((key) => [key, card(figures.metrics[key], undefined, { column: priorLabel, prior: priorLabel }, () => rangeSpark(figures, (m) => m[key]))]),
  ) as Record<CardKey, OverviewCard>;
  const priorRoots = view.prior ? buildTree(view.prior.rows) : null;
  return {
    currency: report.currency,
    range: { start: report.periodStart, end: report.periodEnd },
    label: label({ start: report.periodStart, end: report.periodEnd }),
    cards,
    source: view.statement.fromLedger ? 'range_ledger' : 'range',
    incomeExpense:
      figures.pieces.length >= 2
        ? figures.pieces.map((piece) => ({
            label: formatPeriodCompact(piece.report.periodStart, piece.report.periodEnd, locale),
            incomeCents: piece.metrics.revenue.current?.cents ?? null,
            expenseCents: piece.metrics.operatingExpenses.current?.cents ?? null,
          }))
        : [],
    expenses: withLinks(leafItems(findSection(figures.current, PNL_SYNONYMS.operatingExpenses)), compositionLinks(figures.current, figures.links)),
    pnl: {
      current: pnlMetrics(view.statement.report, figures.current),
      lines: figures.current,
      ...(view.prior && priorRoots ? { prior: pnlMetrics(view.prior.report, priorRoots), priorLines: priorRoots } : {}),
    },
    earlier: [],
    balance: balanceReport && balanceLines ? balanceSheetMetrics(balanceReport, buildTree(balanceLines.get(balanceReport.id) ?? [])) : null,
    nickPeriod: undefined,
    notice,
  };
}

function withLinks(items: { label: string; cents: number }[], links: Map<string, string>): { label: string; cents: number; href?: string }[] {
  return items.map((item) => {
    const href = links.get(item.label);
    return href ? { ...item, href } : item;
  });
}

