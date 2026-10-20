// Expenses, read off the published Profit & Loss — what the page shows for a
// business whose expenses reach the portal on its statement rather than on
// bank statements. Every figure is one the statement prints (or a share of a
// printed total, computed in TypeScript), or — for dates no single statement
// covers — the same accounts added up across the statements and, inside a
// month, from its General Ledger (lib/reports/range.ts).
import { getTranslations } from 'next-intl/server';

import { CompositionBars } from '@/components/charts/CompositionBars';
import { TrendBars } from '@/components/charts/TrendBars';
import { NickPanel } from '@/components/chat/NickPanel';
import { ReportPeriodBar } from '@/components/dashboard/ReportPeriodBar';
import { StatCards, type StatCardItem } from '@/components/dashboard/StatCards';
import { PnlAccountsTable } from '@/components/expenses/PnlAccountsTable';
import { type LedgerAccountRow, LedgerAccountsTable } from '@/components/ledger/LedgerAccountsTable';
import { Notice } from '@/components/portal/Notice';
import { PortalPage } from '@/components/portal/PortalPage';
import { Link } from '@/i18n/navigation';
import { logAccess } from '@/lib/audit/logAccess';
import { type LedgerTxn, type PublishedLedger, ledgerDetailFrom, loadLedgerAccounts, loadLedgerTransactions } from '@/lib/ledger/load';
import { formatCents } from '@/lib/money';
import { loadReportLinesFor } from '@/lib/portal/load';
import { periodParam } from '@/lib/portal/period-param';
import { rangeFigures } from '@/lib/portal/range-figures';
import { loadRangeLineTransactions } from '@/lib/portal/range-statement';
import { type PeriodSelection, loadRangeView, periodBarProps, rangeNotice, selectedRange } from '@/lib/portal/report-period';
import { expenseDelta } from '@/lib/reports/expenses';
import { priorPeriod } from '@/lib/reports/periods';
import { type PnlMetrics, pnlMetrics } from '@/lib/reports/pnl';
import { pnlExpenseLines, shareOf } from '@/lib/reports/pnl-expenses';
import { comparableSeries } from '@/lib/reports/series';
import { buildTree } from '@/lib/reports/tree';
import type { LineNode, Metric, ReportRow } from '@/lib/reports/types';
import type { createClient } from '@/lib/supabase/server';
import { formatPeriod, formatPeriodCompact } from '@/lib/utils/dates';

const TREND_LIMIT = 8;

type Db = Awaited<ReturnType<typeof createClient>>;

/** What the page draws, whichever way the figures were found. */
type Figures = {
  report: ReportRow;
  roots: LineNode[];
  metrics: PnlMetrics;
  /** Each card's figure to compare with, and the period it belongs to. */
  priorOf: (pick: (m: PnlMetrics) => Metric) => number | null;
  priorLabel: string | null;
  trend: { label: string; metrics: PnlMetrics }[];
  /** Account line id → how many transactions stand behind it, and where to fetch them. */
  ledger: Map<string, { count: number; sources?: { txns: string; csv: string } }> | null;
  arrivedTxns: LedgerTxn[] | null;
  notice: string | null;
  fromRange: boolean;
};

export async function PnlExpensesView({
  supabase,
  entity,
  reports,
  allReports,
  ledgers,
  currency,
  selection,
  line,
  locale,
  today,
}: {
  supabase: Db;
  entity: { id: string; name: string };
  /** Published Profit & Loss reports, newest first; at least one. */
  reports: ReportRow[];
  /** Every published statement, as loadPublishedReports returns them. */
  allReports: ReportRow[];
  ledgers: PublishedLedger[];
  /** The business's currency: a range adds statements in it only. */
  currency: string;
  selection: PeriodSelection;
  /** The P&L line the client clicked to get here, opened on arrival. */
  line?: string | undefined;
  locale: string;
  /** todayIn(business timezone). */
  today: string;
}) {
  const [t, tStatements, tOverview, tLedger] = await Promise.all([
    getTranslations('Expenses'),
    getTranslations('Statements'),
    getTranslations('Overview'),
    getTranslations('Ledger'),
  ]);
  const filters = <ReportPeriodBar {...periodBarProps({ selected: selectedRange(selection), today, presetLabel: (preset) => tOverview(`preset_${preset}`) })} />;

  let figures: Figures;
  if (selection.mode === 'range') {
    const periodValue = periodParam(selection.requested);
    const view = await loadRangeView(supabase, entity.id, { reports: allReports, ledgers, currency }, selection.requested);
    const notice = rangeNotice(view, tOverview, locale);
    if (!view.ok) {
      await logAccess({ action: 'expenses.view', resourceType: 'business_entity', resourceId: entity.id, businessEntityId: entity.id, metadata: { source: 'profit_and_loss', period: periodValue, refused: view.reason } }, { afterResponse: true });
      return (
        <>
          <PortalPage title={t('title')} lede={`${entity.name} · ${formatPeriod(selection.requested.start, selection.requested.end, locale)}`} filters={filters}>
            {notice && <Notice text={notice} />}
          </PortalPage>
          <NickPanel page="expenses" businessName={entity.name} />
        </>
      );
    }
    const range = rangeFigures(view.statement, view.prior, periodValue);
    const arrived = line ? view.statement.ledger.get(line) : undefined;
    const sources = (id: string) => ({ txns: `/api/ledger/range?period=${periodValue}&line=${id}`, csv: `/api/ledger/range?period=${periodValue}&line=${id}&format=csv` });
    figures = {
      report: range.report,
      roots: range.current,
      metrics: range.metrics,
      priorOf: (pick) => pick(range.metrics).prior?.cents ?? null,
      priorLabel: range.report.comparativeStart && range.report.comparativeEnd ? formatPeriodCompact(range.report.comparativeStart, range.report.comparativeEnd, locale) : null,
      trend: range.pieces.length >= 2 ? range.pieces.map((piece) => ({ label: formatPeriodCompact(piece.report.periodStart, piece.report.periodEnd, locale), metrics: piece.metrics })) : [],
      ledger: new Map([...view.statement.ledger].map(([id, entry]) => [id, { count: entry.count, sources: sources(id) }])),
      arrivedTxns: arrived ? await loadRangeLineTransactions(supabase, entity.id, arrived) : null,
      notice,
      fromRange: true,
    };
  } else {
    const report = selection.report;
    const selected = { start: report.periodStart, end: report.periodEnd };
    const priorRange = priorPeriod(selected, locale);
    const priorReport = priorRange
      ? (reports.find((r) => r.periodStart === priorRange.start && r.periodEnd === priorRange.end && r.currency === report.currency) ?? null)
      : null;
    // Oldest → newest, the period on screen last. Same statements the P&L page trends.
    const trendReports = comparableSeries(reports, report).slice(0, TREND_LIMIT).reverse();
    // Every statement's lines in one round trip, and the month's ledger
    // accounts beside them: they need the period, not the lines.
    const ids = [...new Set([report.id, priorReport?.id, ...trendReports.map((r) => r.id)].filter((id): id is string => id !== undefined))];
    const [linesById, ledgerAccounts] = await Promise.all([
      loadReportLinesFor(supabase, entity.id, ids),
      loadLedgerAccounts(supabase, entity.id, report, ledgers),
    ]);
    const metricsOf = (r: ReportRow) => pnlMetrics(r, buildTree(linesById.get(r.id) ?? []));
    const roots = buildTree(linesById.get(report.id) ?? []);
    const metrics = pnlMetrics(report, roots);
    const priorMetrics = priorReport ? metricsOf(priorReport) : null;
    // What the figure is compared with: the column the statement itself prints,
    // otherwise the published statement for the period before. Never both.
    const printedPrior = report.comparativeStart !== null && report.comparativeEnd !== null;
    // The month's General Ledger, when the firm published one: which lines open
    // onto the transactions behind them, and how many each has. Only the
    // account the client arrived for comes with the page; the table fetches
    // any other when it is opened (/api/ledger/lines/[lineId]).
    const detail = ledgerDetailFrom(ledgerAccounts, roots);
    const arrived = line ? detail?.lines.get(line) : undefined;
    figures = {
      report,
      roots,
      metrics,
      priorOf: (pick) => (printedPrior ? (pick(metrics).prior?.cents ?? null) : priorMetrics ? (pick(priorMetrics).current?.cents ?? null) : null),
      priorLabel: printedPrior
        ? formatPeriodCompact(report.comparativeStart ?? '', report.comparativeEnd ?? '', locale)
        : priorReport && priorRange
          ? priorRange.label
          : null,
      trend: trendReports.length >= 2 ? trendReports.map((r) => ({ label: formatPeriodCompact(r.periodStart, r.periodEnd, locale), metrics: metricsOf(r) })) : [],
      ledger: detail ? new Map([...detail.lines].map(([id, entry]) => [id, { count: entry.count }])) : null,
      arrivedTxns: arrived ? await loadLedgerTransactions(supabase, entity.id, arrived.accountIds) : null,
      notice: null,
      fromRange: false,
    };
  }

  const { report, metrics } = figures;
  const lines = pnlExpenseLines(figures.roots);
  const operatingLines = lines.filter((l) => l.kind === 'operating');
  const largest = operatingLines[0] ?? lines[0] ?? null;
  const money = (cents: number) => formatCents(cents, report.currency);
  const periodLabel = formatPeriod(report.periodStart, report.periodEnd, locale);
  const periodValue = periodParam(selectedRange(selection));

  const card = (label: string, pick: (m: PnlMetrics) => Metric): StatCardItem => {
    const current = pick(metrics).current?.cents ?? null;
    const prior = figures.priorOf(pick);
    const series = figures.trend.flatMap((point) => {
      const cents = pick(point.metrics).current?.cents;
      return cents === undefined || cents === null ? [] : [cents];
    });
    // The trend's periods when every one prints the figure — a gap is never a
    // zero — otherwise the two points the card already compares.
    const trend =
      series.length === figures.trend.length && series.length >= 2 ? series : current !== null && prior !== null ? [prior, current] : [];
    return {
      label,
      value: current === null ? null : money(current),
      unavailable: tStatements('notPrinted'),
      deltaPct: current === null ? null : expenseDelta(current, prior).deltaPct,
      ...(figures.priorLabel ? { deltaLabel: t('vsPrior', { period: figures.priorLabel }) } : {}),
      upIsGood: false,
      trend,
    };
  };

  const cards: StatCardItem[] = [
    card(tStatements('operatingExpenses'), (m) => m.operatingExpenses),
    card(tStatements('cogs'), (m) => m.cogs),
    {
      label: t('pnlLargest'),
      value: largest ? largest.label : null,
      unavailable: t('pnlNoLines'),
      ...(largest ? { detail: money(largest.cents) } : {}),
    },
  ];

  const trend =
    figures.trend.length >= 2
      ? figures.trend.map((point) => ({
          label: point.label,
          a: point.metrics.operatingExpenses.current?.cents ?? null,
          b: point.metrics.cogs.current?.cents ?? null,
        }))
      : null;
  const totals = { operating: metrics.operatingExpenses.current?.cents ?? null, cogs: metrics.cogs.current?.cents ?? null };
  const kindLabel = { operating: tStatements('operatingExpenses'), cogs: tStatements('cogs') };
  const statementHref = `/statements/profit-and-loss?period=${periodValue}`;

  await logAccess({
    action: 'expenses.view',
    resourceType: figures.fromRange ? 'business_entity' : 'financial_report',
    resourceId: figures.fromRange ? entity.id : report.id,
    businessEntityId: entity.id,
    metadata: { source: 'profit_and_loss', line_count: lines.length, ...(figures.fromRange ? { period: periodValue } : {}) },
  }, { afterResponse: true });

  return (
    <>
      <PortalPage title={t('title')} lede={`${entity.name} · ${periodLabel}`} filters={filters}>
        {figures.notice && <Notice text={figures.notice} />}
        <div className="mt-6">
          <StatCards items={cards} columns={3} />
        </div>
        <p className="text-muted-foreground mt-3 text-small">
          {figures.fromRange ? t('pnlSourceNoteRange') : t('pnlSourceNote')}{' '}
          <Link href={statementHref} className="text-link hover:text-link-hover font-semibold hover:underline">
            {t('pnlViewStatement')}
          </Link>
        </p>

        <div className="mt-6 grid grid-cols-1 gap-4 sm:gap-6 xl:grid-cols-2">
          <Section title={t('pnlByAccountTitle')}>
            {operatingLines.some((l) => l.cents > 0) ? (
              <CompositionBars items={operatingLines.map((l) => ({ label: l.label, cents: l.cents }))} currency={report.currency} otherLabel={t('other')} />
            ) : (
              <Muted text={t('pnlNoLines')} />
            )}
          </Section>
          <Section title={t('pnlTrendTitle')}>
            {trend ? (
              <TrendBars
                points={trend}
                currency={report.currency}
                seriesA={kindLabel.operating}
                seriesB={kindLabel.cogs}
                summary={tStatements(figures.fromRange ? 'trendSummaryRange' : 'trendSummary', { count: trend.length, latest: trend[trend.length - 1]?.label ?? '' })}
              />
            ) : (
              <Muted text={tStatements('trendUnavailable')} />
            )}
          </Section>
        </div>

        <Section title={t('pnlTableTitle')} className="mt-6">
          {lines.length === 0 ? (
            <Muted text={t('pnlNoLines')} />
          ) : figures.ledger && figures.ledger.size > 0 ? (
            <>
              <p className="text-muted-foreground -mt-2 mb-3 text-small">{tLedger('expensesHint', { period: periodLabel })}</p>
              <LedgerAccountsTable
                currency={report.currency}
                openId={line ?? null}
                rows={lines.map((l): LedgerAccountRow => {
                  const entry = figures.ledger?.get(l.id);
                  return {
                    id: l.id,
                    label: l.label,
                    group: l.group,
                    kindLabel: kindLabel[l.kind],
                    cents: l.cents,
                    share: shareOf(l.cents, totals[l.kind]),
                    count: entry?.count ?? null,
                    txns: figures.arrivedTxns && l.id === line ? figures.arrivedTxns : null,
                    ...(entry?.sources ? { sources: entry.sources } : {}),
                  };
                })}
              />
              <p className="text-muted-foreground mt-3 text-small">{t('pnlShareNote')}</p>
            </>
          ) : (
            <PnlAccountsTable lines={lines} totals={totals} kindLabel={kindLabel} currency={report.currency} />
          )}
        </Section>
      </PortalPage>
      <NickPanel page="expenses" {...(figures.fromRange ? {} : { period: periodValue })} businessName={entity.name} />
    </>
  );
}

function Section({ title, className = '', children }: { title: string; className?: string; children: React.ReactNode }) {
  return (
    <section className={`border-line bg-card rounded-2xl border p-5 shadow-card ${className}`}>
      <h2 className="text-ink text-title font-semibold">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Muted({ text }: { text: string }) {
  return <p className="text-muted-foreground text-ui">{text}</p>;
}
