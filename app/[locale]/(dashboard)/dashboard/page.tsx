// Client Overview (INITIAL_PROMPT.md §7): published data only, source-safe
// KPIs, complete-period cash, deterministic insights, reminders and originals.
import { getLocale, getTranslations } from 'next-intl/server';

import { CashChart } from '@/components/charts/CashChart';
import { NickPanel } from '@/components/chat/NickPanel';
import { CompositionBars } from '@/components/charts/CompositionBars';
import { DownloadReportsMenu } from '@/components/dashboard/DownloadReportsMenu';
import { IncomeBehaviorCard } from '@/components/dashboard/IncomeBehaviorCard';
import { InsightsCard } from '@/components/dashboard/InsightsCard';
import { KpiCard } from '@/components/dashboard/KpiCard';
import { PeriodSelector } from '@/components/dashboard/PeriodSelector';
import { RemindersCard } from '@/components/dashboard/RemindersCard';
import { ReportTiles } from '@/components/dashboard/ReportTiles';
import { logAccess } from '@/lib/audit/logAccess';
import { getCurrentEntity } from '@/lib/auth/getCurrentEntity';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { generateInsights } from '@/lib/insights/rules';
import type { PnlInput } from '@/lib/insights/types';
import {
  loadPortalEntitySettings,
  loadPublishedBankStatements,
  loadPublishedBankTransactions,
  loadPublishedDocuments,
  loadPublishedReports,
  loadReminders,
  loadReportLines,
} from '@/lib/portal/load';
import { parsePeriodParam, periodParam } from '@/lib/portal/period-param';
import { leafItems } from '@/lib/portal/statement-page';
import { type Metric, type ReportRow } from '@/lib/reports';
import { balanceSheetMetrics } from '@/lib/reports/balance-sheet';
import { cashByMonth, cashComparison, cashTotals } from '@/lib/reports/cash';
import { availablePeriods, bankAccountsCoverPeriod, periodKind, priorPeriod } from '@/lib/reports/periods';
import { PNL_SYNONYMS, type PnlMetrics, pnlMetrics } from '@/lib/reports/pnl';
import { findSection } from '@/lib/reports/sections';
import { buildTree } from '@/lib/reports/tree';
import { createClient } from '@/lib/supabase/server';
import { formatPeriod } from '@/lib/utils/dates';

type Delta = { cents: number | null; deltaCents: number | null; deltaPct: number | null };

/** How many published P&L periods the headline sparklines run over. */
const PNL_TREND_LIMIT = 6;

/** Fallback trend when no monthly source exists: the two real figures the delta already compares. */
function priorAndCurrent(cents: number | null | undefined, deltaCents: number | null | undefined): number[] {
  return cents === null || cents === undefined || deltaCents === null || deltaCents === undefined ? [] : [cents - deltaCents, cents];
}

function exactReport(reports: ReportRow[], type: ReportRow['reportType'], range: { start: string; end: string }): ReportRow | null {
  return reports.find((report) => report.reportType === type && report.periodStart === range.start && report.periodEnd === range.end) ?? null;
}

function metricDelta(metric: Metric | undefined, priorMetric: Metric | undefined): Delta {
  const cents = metric?.current?.cents ?? null;
  if (cents === null) return { cents: null, deltaCents: null, deltaPct: null };
  if (metric?.deltaCents !== null && metric?.deltaCents !== undefined) {
    return { cents, deltaCents: metric.deltaCents, deltaPct: metric.deltaPct };
  }
  const prior = priorMetric?.current?.cents;
  if (prior === null || prior === undefined) return { cents, deltaCents: null, deltaPct: null };
  const deltaCents = cents - prior;
  return { cents, deltaCents, deltaPct: prior === 0 ? null : (deltaCents / Math.abs(prior)) * 100 };
}

export default async function OverviewPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const [t, locale, user, entity, params] = await Promise.all([
    getTranslations('Overview'),
    getLocale(),
    getCurrentUser(),
    getCurrentEntity(),
    searchParams,
  ]);

  let firstName = '';
  if (user) {
    const profileClient = await createClient();
    const { data } = await profileClient.from('profiles').select('full_name').eq('id', user.id).maybeSingle();
    firstName = data?.full_name?.trim().split(/\s+/)[0] ?? '';
  }

  if (!entity) {
    return (
      <OverviewShell greeting={firstName ? t('greeting', { name: firstName }) : t('greetingAnon')} subtitle={t('subtitlePending')}>
        <EmptyState title={t('pendingTitle')} body={t('pendingBody')} />
      </OverviewShell>
    );
  }

  const supabase = await createClient();
  const [settings, reports, bankStatements, documents, reminders] = await Promise.all([
    loadPortalEntitySettings(supabase, entity.id),
    loadPublishedReports(supabase, entity.id),
    loadPublishedBankStatements(supabase, entity.id),
    loadPublishedDocuments(supabase, entity.id),
    loadReminders(supabase, entity.id),
  ]);

  const defaultCurrencyStatements = bankStatements.filter((statement) => statement.currency === settings.currency);
  const periods = availablePeriods(reports, defaultCurrencyStatements, { locale }).filter((period) =>
    period.sources.some((source) => source === 'pnl' || source === 'bank'),
  );
  const requested = parsePeriodParam(params.period);
  const selected = (requested && periods.find((period) => period.start === requested.start && period.end === requested.end)) ?? periods[0] ?? null;
  const downloadItems = documents.flatMap((document) => document.currentVersionId ? [{
    versionId: document.currentVersionId,
    title: document.title,
    subtitle: document.periodStart && document.periodEnd ? formatPeriod(document.periodStart, document.periodEnd, locale) : '',
  }] : []);

  if (!selected) {
    await logAccess({ action: 'dashboard.view', resourceType: 'business_entity', resourceId: entity.id, businessEntityId: entity.id });
    return (
      <OverviewShell
        greeting={firstName ? t('greeting', { name: firstName }) : t('greetingAnon')}
        subtitle={t('subtitle', { business: entity.name })}
        actions={<DownloadReportsMenu items={downloadItems} />}
      >
        <EmptyState title={t('emptyTitle')} body={t('emptyBody', { business: entity.name })} />
        <div id="reminders" className="mt-6"><RemindersCard reminders={reminders} currency={settings.currency} /></div>
        <div className="mt-6"><ReportTiles documents={documents.slice(0, 6)} showLibraryLink={documents.length > 0} /></div>
        <NickPanel page="overview" businessName={entity.name} />
      </OverviewShell>
    );
  }

  const currentPnlReport = exactReport(reports, 'profit_and_loss', selected);
  const priorRange = priorPeriod(selected, locale);
  const priorPnlReport = priorRange ? exactReport(reports, 'profit_and_loss', priorRange) : null;
  const balanceReport = reports.find((report) => report.reportType === 'balance_sheet' && report.periodEnd <= selected.end) ?? null;
  const currency = currentPnlReport?.currency ?? settings.currency;
  const currencyStatements = bankStatements.filter((statement) => statement.currency === currency);
  const accountRanges = currencyStatements.map((statement) => ({ bankAccountId: statement.bankAccountId, start: statement.periodStart, end: statement.periodEnd }));
  const cashCovered = bankAccountsCoverPeriod(accountRanges, selected);
  const priorCashCovered = priorRange ? bankAccountsCoverPeriod(accountRanges, priorRange) : false;

  // The headline sparklines run over the published P&Ls of the same kind as the
  // selected period, oldest first — a monthly view trends months, an annual one
  // trends years, so the shape never mixes granularities (spec §3).
  const selectedKind = periodKind(selected.start, selected.end);
  const pnlTrendReports = reports
    .filter((report) => report.reportType === 'profit_and_loss' && report.periodEnd <= selected.end && periodKind(report.periodStart, report.periodEnd) === selectedKind)
    .slice(0, PNL_TREND_LIMIT)
    .reverse();

  const [currentLines, priorLines, balanceLines, currentTransactions, priorTransactions, pnlTrendLines] = await Promise.all([
    currentPnlReport ? loadReportLines(supabase, entity.id, currentPnlReport.id) : Promise.resolve([]),
    priorPnlReport ? loadReportLines(supabase, entity.id, priorPnlReport.id) : Promise.resolve([]),
    balanceReport ? loadReportLines(supabase, entity.id, balanceReport.id) : Promise.resolve([]),
    cashCovered ? loadPublishedBankTransactions(supabase, entity.id, currency, selected) : Promise.resolve([]),
    priorRange && priorCashCovered ? loadPublishedBankTransactions(supabase, entity.id, currency, priorRange) : Promise.resolve([]),
    Promise.all(pnlTrendReports.map((report) => loadReportLines(supabase, entity.id, report.id))),
  ]);

  const currentRoots = buildTree(currentLines);
  const priorRoots = buildTree(priorLines);
  const currentPnl = currentPnlReport ? pnlMetrics(currentPnlReport, currentRoots) : null;
  const priorPnl = priorPnlReport ? pnlMetrics(priorPnlReport, priorRoots) : null;
  const netIncome = metricDelta(currentPnl?.netIncome, priorPnl?.netIncome);
  const revenue = metricDelta(currentPnl?.revenue, priorPnl?.revenue);
  const grossProfit = metricDelta(currentPnl?.grossProfit, priorPnl?.grossProfit);
  const operatingExpenses = metricDelta(currentPnl?.operatingExpenses, priorPnl?.operatingExpenses);
  // A period whose statement does not print a total contributes nothing rather
  // than a zero, so a gap never reads as a collapse to nil.
  const pnlTrend = pnlTrendReports.map((report, index) => pnlMetrics(report, buildTree(pnlTrendLines[index] ?? [])));
  const pnlSeries = (pick: (m: PnlMetrics) => Metric): number[] => {
    const points = pnlTrend.flatMap((metrics) => {
      const cents = pick(metrics).current?.cents;
      return cents === undefined || cents === null ? [] : [cents];
    });
    return points.length === pnlTrend.length && points.length >= 2 ? points : [];
  };
  const months = cashCovered ? cashByMonth(currentTransactions, selected) : [];
  const priorMonths = priorRange && priorCashCovered ? cashByMonth(priorTransactions, priorRange) : [];
  const cash = cashCovered ? cashComparison(months, priorMonths) : null;
  const totals = cashCovered ? cashTotals(months) : null;
  const pnlInput: PnlInput | undefined = currentPnl ? {
    current: currentPnl,
    lines: currentRoots,
    ...(priorPnl ? { prior: priorPnl, priorLines: priorRoots } : {}),
  } : undefined;
  const insights = generateInsights({
    ...(pnlInput ? { pnl: pnlInput } : {}),
    ...(totals ? { cash: { current: totals, ...(priorCashCovered ? { prior: cashTotals(priorMonths) } : {}), months } } : {}),
    ...(balanceReport ? { balance: balanceSheetMetrics(balanceReport, buildTree(balanceLines)) } : {}),
    reminders,
    reportsNeedingReview: 0,
    today: new Date().toISOString().slice(0, 10),
  });
  const expenses = leafItems(findSection(currentRoots, PNL_SYNONYMS.operatingExpenses));
  const priorLabel = priorRange?.label ?? selected.label;

  await logAccess({ action: 'dashboard.view', resourceType: 'business_entity', resourceId: entity.id, businessEntityId: entity.id });

  return (
    <OverviewShell
      greeting={firstName ? t('greeting', { name: firstName }) : t('greetingAnon')}
      subtitle={t('subtitlePeriod', { business: entity.name, period: selected.label })}
      actions={
        <>
          <PeriodSelector options={periods.map((period) => ({ value: periodParam(period), label: period.label }))} current={periodParam(selected)} />
          <DownloadReportsMenu items={downloadItems} />
        </>
      }
    >
      <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label={t('kpiGrossIncome')} cents={revenue.cents} currency={currency} deltaCents={revenue.deltaCents} deltaPct={revenue.deltaPct} upIsGood periodLabel={priorLabel} how={t('howGrossIncome')} href="/statements/profit-and-loss" trend={pnlSeries((m) => m.revenue).length >= 2 ? pnlSeries((m) => m.revenue) : priorAndCurrent(revenue.cents, revenue.deltaCents)} unavailableReason={t('notPrintedOnPnl')} />
        <KpiCard label={t('kpiTotalExpenses')} cents={operatingExpenses.cents} currency={currency} deltaCents={operatingExpenses.deltaCents} deltaPct={operatingExpenses.deltaPct} upIsGood={false} periodLabel={priorLabel} how={t('howTotalExpenses')} href="/statements/profit-and-loss" trend={pnlSeries((m) => m.operatingExpenses).length >= 2 ? pnlSeries((m) => m.operatingExpenses) : priorAndCurrent(operatingExpenses.cents, operatingExpenses.deltaCents)} unavailableReason={t('notPrintedOnPnl')} />
        <KpiCard label={t('kpiGrossProfit')} cents={grossProfit.cents} currency={currency} deltaCents={grossProfit.deltaCents} deltaPct={grossProfit.deltaPct} upIsGood periodLabel={priorLabel} how={t('howGrossProfit')} href="/statements/profit-and-loss" trend={pnlSeries((m) => m.grossProfit).length >= 2 ? pnlSeries((m) => m.grossProfit) : priorAndCurrent(grossProfit.cents, grossProfit.deltaCents)} unavailableReason={t('notPrintedOnPnl')} />
        <KpiCard label={t('kpiNetIncome')} cents={netIncome.cents} currency={currency} deltaCents={netIncome.deltaCents} deltaPct={netIncome.deltaPct} upIsGood periodLabel={priorLabel} how={t('howNetIncome')} href="/statements/profit-and-loss" trend={pnlSeries((m) => m.netIncome).length >= 2 ? pnlSeries((m) => m.netIncome) : priorAndCurrent(netIncome.cents, netIncome.deltaCents)} unavailableReason={t('notPrintedOnPnl')} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[2fr_1fr]">
        <section id="cash-chart" className="border-line bg-card rounded-2xl border p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <h2 className="text-ink text-[16px] font-semibold">{t('cashChartTitle')}</h2>
          <p className="text-muted-foreground mt-1 text-[13px]">{t('cashChartLede')}</p>
          <div className="mt-4">{cashCovered && months.length > 0 ? <CashChart months={months} currency={currency} /> : <p className="text-muted-foreground text-[14px]">{t('cashIncompletePeriod')}</p>}</div>
        </section>
        <InsightsCard insights={insights} currency={currency} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <IncomeBehaviorCard revenueCents={revenue.cents} cashInCents={cash?.cashIn.currentCents ?? null} currency={currency} />
        <section className="border-line bg-card rounded-2xl border p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <h2 className="text-ink text-[16px] font-semibold">{t('expensesTitle')}</h2>
          <p className="text-muted-foreground mt-1 text-[13px]">{t('expensesLede')}</p>
          <div className="mt-4">{expenses.length > 0 ? <CompositionBars items={expenses} currency={currency} otherLabel={t('other')} /> : <p className="text-muted-foreground text-[14px]">{t('expensesEmpty')}</p>}</div>
        </section>
      </div>

      <div id="reminders" className="mt-6"><RemindersCard reminders={reminders} currency={currency} /></div>
      <div className="mt-6"><ReportTiles documents={documents.slice(0, 6)} showLibraryLink={documents.length > 0} /></div>
      <NickPanel page="overview" period={periodParam(selected)} businessName={entity.name} />
    </OverviewShell>
  );
}

function OverviewShell({ greeting, subtitle, actions, children }: { greeting: string; subtitle: string; actions?: React.ReactNode; children: React.ReactNode }) {
  return <main className="mx-auto w-full max-w-[1200px] px-6 py-10 md:px-10"><div className="flex flex-wrap items-end justify-between gap-4"><div><h1 className="text-ink text-[28px] font-bold tracking-[-0.01em]">{greeting}</h1><p className="text-muted-foreground mt-1.5 text-[15px]">{subtitle}</p></div>{actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}</div>{children}</main>;
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return <section className="border-line bg-card mt-8 rounded-2xl border p-8 shadow-[0_1px_2px_rgba(15,23,42,0.04)]"><h2 className="text-ink text-[18px] font-semibold">{title}</h2><p className="text-muted-foreground mt-2 max-w-[560px] text-[15px] leading-[1.55]">{body}</p></section>;
}
