// Everything the report document needs, derived from one published statement.
// Pure: no database, no filesystem, no clock of its own. The route supplies the
// expense leaves (that read is server-only) and the brand assets.
import { formatIsoDate } from '@/lib/utils/dates';

import { LIABILITIES_AND_EQUITY, balanceSheetMetrics } from './balance-sheet';
import { pnlMetrics } from './pnl';
import { type ExpenseItem, balanceAnalysis, pnlAnalysis } from './report-analysis';
import type { KpiCard } from './report-cover';
import { reportMoney, reportNumber, reportPercent } from './report-format';
import type { Bands, ReportHtmlInput, StatementColumn } from './report-html';
import { type ReportLabels, reportLabels } from './report-labels';
import { findTotal } from './sections';
import type { LineNode, Metric, ReportRow } from './types';

const LONG_DATE: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' };
const SHORT_DATE: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' };
const NO_FIGURE = '—';

export type ReportDocumentInput = {
  report: ReportRow;
  roots: readonly LineNode[];
  entityName: string;
  locale: string;
  /** Expense leaves for the "led by" clause; empty for a balance sheet. */
  expenses: readonly ExpenseItem[];
  /** The letter's date as ISO `YYYY-MM-DD`, already resolved in the business's
   *  time zone — a report dated in UTC is dated tomorrow for half the day. */
  today: string;
};

function periodLabel(report: ReportRow, locale: string): string {
  const start = formatIsoDate(report.periodStart, locale, LONG_DATE);
  const end = formatIsoDate(report.periodEnd, locale, LONG_DATE);
  // A balance sheet is a snapshot: one date, not a range.
  return start === end ? end : `${start} – ${end}`;
}

function card(
  label: string,
  metric: Metric,
  money: (c: number | null) => string,
  highlight = false,
): KpiCard {
  const cents = metric.current?.cents ?? null;
  return {
    label,
    value: cents === null ? NO_FIGURE : money(cents),
    ...(cents !== null && cents < 0 ? { negative: true } : {}),
    ...(highlight ? { highlight: true } : {}),
  };
}

export function buildReportInput(input: ReportDocumentInput): Omit<ReportHtmlInput, 'assets'> {
  const { report, roots, locale } = input;
  const t: ReportLabels = reportLabels(locale);
  const isBalance = report.reportType === 'balance_sheet';
  const money = (cents: number | null) => reportMoney(cents, report.currency, locale);
  const plain = (cents: number | null) => reportNumber(cents, locale);
  const basisLabel = report.basis === 'cash' ? t.basisCash : t.basisAccrual;
  const basisExplained = report.basis === 'cash' ? t.basisCashExplained : t.basisAccrualExplained;

  const columns: StatementColumn[] = [
    {
      label: t.totalColumn.replace('{currency}', report.currency),
      value: (line) => line.currentCents,
    },
  ];
  // The comparative column only exists when the published statement prints one.
  if (roots.length > 0 && report.comparativeStart && report.comparativeEnd) {
    // Compact: the column label sits in tracked uppercase beside "TOTAL (USD)",
    // and a spelled-out month range crowds it off the page.
    const from = formatIsoDate(report.comparativeStart, locale, SHORT_DATE);
    const to = formatIsoDate(report.comparativeEnd, locale, SHORT_DATE);
    columns.push({
      label: from === to ? to : `${from} – ${to}`,
      value: (line) => line.priorCents,
    });
  }

  let bands: Bands;
  let kpis: KpiCard[];
  let analysis: string[];
  const ctx = { labels: t, locale, money, percent: (v: number | null) => reportPercent(v, locale) };

  if (isBalance) {
    const metrics = balanceSheetMetrics(report, roots);
    // A balance sheet closes on "Total Liabilities and Equity"; Total Assets is
    // the key subtotal on the way there, not the last word.
    bands = {
      highlight: metrics.totalAssets.current?.lineId ?? null,
      final:
        findTotal(roots, LIABILITIES_AND_EQUITY)?.id ?? metrics.totalEquity.current?.lineId ?? null,
    };
    kpis = [
      card(t.kpiAssets, metrics.totalAssets, money),
      card(t.kpiLiabilities, metrics.totalLiabilities, money),
      card(t.kpiEquity, metrics.totalEquity, money),
      card(t.kpiWorkingCapital, metrics.workingCapital, money, true),
    ];
    analysis = balanceAnalysis(metrics, ctx);
  } else {
    const metrics = pnlMetrics(report, roots);
    bands = {
      highlight: metrics.grossProfit.current?.lineId ?? null,
      final: metrics.netIncome.current?.lineId ?? null,
    };
    kpis = [
      card(t.kpiIncome, metrics.revenue, money),
      card(t.kpiGrossProfit, metrics.grossProfit, money),
      card(t.kpiExpenses, metrics.operatingExpenses, money),
      card(t.kpiNetIncome, metrics.netIncome, money, true),
    ];
    analysis = pnlAnalysis(metrics, input.expenses, ctx);
  }

  return {
    labels: t,
    entityName: input.entityName,
    title: isBalance ? t.balanceSheet : t.profitAndLoss,
    periodLabel: periodLabel(report, locale),
    basisLabel,
    currency: report.currency,
    roots,
    columns,
    bands,
    format: plain,
    formatTotal: money,
    cover: {
      basisExplained,
      dateLabel: formatIsoDate(input.today, locale, LONG_DATE),
      analysis,
      kpis,
    },
  };
}
