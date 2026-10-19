// Everything the report document needs, derived from one published statement.
// Pure: no database, no filesystem, no clock of its own. The route supplies
// today's date and the brand assets.
import { formatIsoDate } from '@/lib/utils/dates';

import { LIABILITIES_AND_EQUITY, balanceSheetMetrics } from './balance-sheet';
import { pnlMetrics } from './pnl';
import type { KpiCard } from './report-cover';
import { fillTemplate, reportMoney, reportNumber } from './report-format';
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
  const money = (cents: number | null) => reportMoney(cents, report.currency);
  const plain = (cents: number | null) => reportNumber(cents);
  const cash = report.basis === 'cash';
  const basisLabel = cash ? t.basisCash : t.basisAccrual;

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
  }

  const period = periodLabel(report, locale);
  // A balance sheet is read as of the day it closes, whatever range it was published with.
  const asOf = formatIsoDate(report.periodEnd, locale, LONG_DATE);
  const documentName = isBalance ? t.balanceDocument : t.pnlDocument;
  const intro = fillTemplate(isBalance ? t.introBalance : t.introPnl, {
    document: documentName,
    company: input.entityName,
    period,
    date: asOf,
    basis: cash ? t.basisCashPhrase : t.basisAccrualPhrase,
  });
  const summary = isBalance ? t.summaryBalance : cash ? t.summaryCash : t.summaryAccrual;

  return {
    labels: t,
    entityName: input.entityName,
    title: isBalance ? t.balanceSheet : t.profitAndLoss,
    periodLabel: period,
    basisLabel,
    currency: report.currency,
    roots,
    columns,
    bands,
    format: plain,
    formatTotal: money,
    cover: {
      dateLabel: formatIsoDate(input.today, locale, LONG_DATE),
      heading: fillTemplate(t.coverLine, {
        document: documentName,
        period: isBalance ? fillTemplate(t.asOf, { date: asOf }) : period,
        basis: basisLabel,
      }),
      intro: `${intro} ${summary}`,
      enclosure: fillTemplate(t.enclosure, { document: documentName }),
      kpis,
    },
  };
}
