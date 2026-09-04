// Client Overview (INITIAL_PROMPT.md §7): published data only, source-safe
// KPIs read from the published Profit & Loss, deterministic insights,
// reminders and originals. The portal does not track cash flow.
import { getLocale, getTranslations } from 'next-intl/server';

import { NickPanel } from '@/components/chat/NickPanel';
import { CompositionBars } from '@/components/charts/CompositionBars';
import { IncomeExpenseChart } from '@/components/charts/IncomeExpenseChart';
import { DownloadReportsMenu } from '@/components/dashboard/DownloadReportsMenu';
import { IncomeTaxCard } from '@/components/dashboard/IncomeTaxCard';
import { InsightsCard } from '@/components/dashboard/InsightsCard';
import { KpiCard } from '@/components/dashboard/KpiCard';
import { GranularityTabs } from '@/components/dashboard/GranularityTabs';
import { PeriodPicker } from '@/components/dashboard/PeriodPicker';
import { periodPickerProps } from '@/lib/portal/period-picker';
import { RemindersCard } from '@/components/dashboard/RemindersCard';
import { ReportTiles } from '@/components/dashboard/ReportTiles';
import { logAccess } from '@/lib/audit/logAccess';
import { formatCents } from '@/lib/money';
import { todayIn } from '@/lib/utils/timezone';
import { getCurrentEntity } from '@/lib/auth/getCurrentEntity';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { INSIGHT_PERIODS, type InsightPeriod, insightsAcrossPeriods } from '@/lib/insights/periods';
import { MAX_INSIGHTS, type PnlInput } from '@/lib/insights/types';
import {
  loadPortalEntitySettings,
  loadPublishedBankStatements,
  loadPublishedDocuments,
  loadPublishedReports,
  loadInsightDismissals,
  loadReminders,
  loadReportLines,
} from '@/lib/portal/load';
import { granularityChoices } from '@/lib/portal/granularity';
import { parsePeriodParam, periodParam } from '@/lib/portal/period-param';
import { leafItems } from '@/lib/portal/statement-page';
import { type Metric, type ReportRow } from '@/lib/reports';
import { balanceSheetMetrics } from '@/lib/reports/balance-sheet';
import { availablePeriods, periodKind, periodLabel, priorPeriod } from '@/lib/reports/periods';
import { PNL_SYNONYMS, type PnlMetrics, pnlMetrics } from '@/lib/reports/pnl';
import { findSection } from '@/lib/reports/sections';
import { buildTree } from '@/lib/reports/tree';
import { loadTaxObligations } from '@/lib/portal/taxes';
import { createClient } from '@/lib/supabase/server';
import { formatPeriod } from '@/lib/utils/dates';

// Which figure the delta was measured against. The statement's own comparative
// column and the previous published period are different periods, and labelling
// one with the other's name is how "+12.0% vs Jul–Dec 2025" appeared over a
// year-over-year comparison. Nick already distinguishes the two.
type ComparedTo = 'comparative_column' | 'prior_period_report';
type Delta = {
  cents: number | null;
  deltaCents: number | null;
  deltaPct: number | null;
  comparedTo: ComparedTo | null;
};

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
  if (cents === null) return { cents: null, deltaCents: null, deltaPct: null, comparedTo: null };
  if (metric?.deltaCents !== null && metric?.deltaCents !== undefined) {
    return { cents, deltaCents: metric.deltaCents, deltaPct: metric.deltaPct, comparedTo: 'comparative_column' };
  }
  const prior = priorMetric?.current?.cents;
  if (prior === null || prior === undefined) return { cents, deltaCents: null, deltaPct: null, comparedTo: null };
  const deltaCents = cents - prior;
  return {
    cents,
    deltaCents,
    deltaPct: prior === 0 ? null : (deltaCents / Math.abs(prior)) * 100,
    comparedTo: 'prior_period_report',
  };
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
  const [settings, reports, bankStatements, documents, reminders, incomeTaxes, dismissedInsights] = await Promise.all([
    loadPortalEntitySettings(supabase, entity.id),
    loadPublishedReports(supabase, entity.id),
    loadPublishedBankStatements(supabase, entity.id),
    loadPublishedDocuments(supabase, entity.id),
    loadReminders(supabase, entity.id),
    loadTaxObligations(supabase, entity.id, 'income'),
    loadInsightDismissals(supabase, entity.id),
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
        logoUrl={settings.logoUrl}
        actions={<DownloadReportsMenu items={downloadItems} />}
      >
        <EmptyState title={t('emptyTitle')} body={t('emptyBody', { business: entity.name })} />
        <div id="reminders" className="mt-6"><RemindersCard reminders={reminders} currency={settings.currency} today={todayIn(settings.timezone)} /></div>
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
  const modules = settings.modules;

  // The headline sparklines run over the published P&Ls of the same kind as the
  // selected period, oldest first — a monthly view trends months, an annual one
  // trends years, so the shape never mixes granularities (spec §3).
  const selectedKind = periodKind(selected.start, selected.end);
  const pnlTrendReports = reports
    .filter((report) => report.reportType === 'profit_and_loss' && report.periodEnd <= selected.end && periodKind(report.periodStart, report.periodEnd) === selectedKind)
    .slice(0, PNL_TREND_LIMIT)
    .reverse();

  // Every statement's lines are read once: the selected and prior P&Ls are
  // normally inside the trend window too, and were being fetched twice.
  const lineReportIds = [
    ...new Set([currentPnlReport?.id, priorPnlReport?.id, balanceReport?.id, ...pnlTrendReports.map((report) => report.id)].filter((id): id is string => id !== undefined)),
  ];
  const lineSets = await Promise.all(lineReportIds.map((id) => loadReportLines(supabase, entity.id, id)));
  const linesById = new Map(lineReportIds.map((id, index) => [id, lineSets[index] ?? []]));
  const linesOf = (report: ReportRow | null) => (report ? (linesById.get(report.id) ?? []) : []);
  const currentLines = linesOf(currentPnlReport);
  const priorLines = linesOf(priorPnlReport);
  const balanceLines = linesOf(balanceReport);
  const pnlTrendLines = pnlTrendReports.map((report) => linesOf(report));

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
  const pnlTrendTrees = pnlTrendReports.map((_, index) => buildTree(pnlTrendLines[index] ?? []));
  const pnlTrend = pnlTrendReports.map((report, index) => pnlMetrics(report, pnlTrendTrees[index] ?? []));
  const pnlSeries = (pick: (m: PnlMetrics) => Metric): number[] => {
    const points = pnlTrend.flatMap((metrics) => {
      const cents = pick(metrics).current?.cents;
      return cents === undefined || cents === null ? [] : [cents];
    });
    return points.length === pnlTrend.length && points.length >= 2 ? points : [];
  };
  const trendFor = (pick: (m: PnlMetrics) => Metric, delta: Delta): number[] => {
    const series = pnlSeries(pick);
    return series.length >= 2 ? series : priorAndCurrent(delta.cents, delta.deltaCents);
  };
  // The cards dropped the source pill at the owner's request; the source still
  // travels in the "how is this calculated" tooltip (§2 rule 10), and says
  // "entered by your accountant" when there is no document behind the figure.
  const pnlSourceNote = t(currentPnlReport?.source === 'firm_entry' ? 'sourceEntryNote' : 'sourceDocumentNote');
  const pnlInput: PnlInput | undefined = currentPnl ? {
    current: currentPnl,
    lines: currentRoots,
    ...(priorPnl ? { prior: priorPnl, priorLines: priorRoots } : {}),
  } : undefined;
  const today = todayIn(settings.timezone);
  // Insights run over the last few published periods, not only the selected
  // one: the earlier periods get the statement rules (their balance figures
  // are not loaded), and the selected period gets the full set. Rows
  // this user has already checked off are dropped here.
  const earlierPeriods: InsightPeriod[] = pnlTrendReports.flatMap((report, index) => {
    const metrics = pnlTrend[index];
    if (!metrics || report.periodEnd >= selected.end) return [];
    return [{
      start: report.periodStart,
      end: report.periodEnd,
      label: periodLabel(report.periodStart, report.periodEnd, selectedKind, locale),
      metrics,
      lines: pnlTrendTrees[index] ?? [],
    }];
  }).slice(-(INSIGHT_PERIODS - 1));
  const insights = insightsAcrossPeriods(
    { start: selected.start, end: selected.end, label: selected.label },
    earlierPeriods,
    {
      ...(pnlInput ? { pnl: pnlInput } : {}),
      ...(balanceReport ? { balance: balanceSheetMetrics(balanceReport, buildTree(balanceLines)) } : {}),
      reminders,
      reportsNeedingReview: 0,
      today,
    },
    MAX_INSIGHTS + INSIGHT_PERIODS,
    dismissedInsights,
  );
  const expenses = leafItems(findSection(currentRoots, PNL_SYNONYMS.operatingExpenses));
  const priorLabel = priorRange?.label ?? selected.label;
  // A statement's comparative column names its own period; when it does not, say
  // so rather than borrowing the previous period's name.
  const comparativeLabel =
    currentPnlReport?.comparativeStart && currentPnlReport?.comparativeEnd
      ? formatPeriod(currentPnlReport.comparativeStart, currentPnlReport.comparativeEnd, locale)
      : null;
  const periodLabelFor = (delta: Delta): string =>
    delta.comparedTo === 'comparative_column' ? (comparativeLabel ?? t('priorColumn')) : priorLabel;
  // Income and expenses come from the same statement, period by period; a
  // period that prints neither total is dropped rather than drawn at zero.
  const incomeExpense = pnlTrendReports.flatMap((report, index) => {
    const metrics = pnlTrend[index];
    const income = metrics?.revenue.current?.cents ?? null;
    const expense = metrics?.operatingExpenses.current?.cents ?? null;
    if (income === null && expense === null) return [];
    // periodLabel, not the full range: "May 2026" fits an axis tick where
    // "May 1, 2026 – May 31, 2026" would crowd every other label off it.
    return [{ label: periodLabel(report.periodStart, report.periodEnd, selectedKind, locale), incomeCents: income, expenseCents: expense }];
  });
  const netForPeriod = revenue.cents !== null && operatingExpenses.cents !== null ? revenue.cents - operatingExpenses.cents : null;

  const money = (cents: number) => formatCents(cents, currency, locale);

  await logAccess({ action: 'dashboard.view', resourceType: 'business_entity', resourceId: entity.id, businessEntityId: entity.id });

  return (
    <OverviewShell
      greeting={firstName ? t('greeting', { name: firstName }) : t('greetingAnon')}
      subtitle={t('subtitlePeriod', { business: entity.name, period: selected.label })}
      logoUrl={settings.logoUrl}
      actions={
        <>
          {modules.statements && (
            <>
              <GranularityTabs choices={granularityChoices(periods, selected)} />
              <PeriodPicker {...periodPickerProps({ periods, selected, today, locale, presetLabel: (preset) => t(`preset_${preset}`) })} />
            </>
          )}
          <DownloadReportsMenu items={downloadItems} />
        </>
      }
    >
      {/* Everything below the greeting is module-scoped. The Overview is the
          home of every package, so it shows what the client bought and nothing
          else — a sales-tax-only client has no Profit & Loss for these to read. */}
      {modules.statements && (
      <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label={t('kpiGrossIncome')} cents={revenue.cents} currency={currency} deltaCents={revenue.deltaCents} deltaPct={revenue.deltaPct} upIsGood periodLabel={periodLabelFor(revenue)} how={`${t('howGrossIncome')} ${pnlSourceNote}`} href="/statements/profit-and-loss" trend={trendFor((m) => m.revenue, revenue)} unavailableReason={t('notPrintedOnPnl')} />
        <KpiCard label={t('kpiTotalExpenses')} cents={operatingExpenses.cents} currency={currency} deltaCents={operatingExpenses.deltaCents} deltaPct={operatingExpenses.deltaPct} upIsGood={false} periodLabel={periodLabelFor(operatingExpenses)} how={`${t('howTotalExpenses')} ${pnlSourceNote}`} href="/statements/profit-and-loss" trend={trendFor((m) => m.operatingExpenses, operatingExpenses)} unavailableReason={t('notPrintedOnPnl')} />
        <KpiCard label={t('kpiGrossProfit')} cents={grossProfit.cents} currency={currency} deltaCents={grossProfit.deltaCents} deltaPct={grossProfit.deltaPct} upIsGood periodLabel={periodLabelFor(grossProfit)} how={`${t('howGrossProfit')} ${pnlSourceNote}`} href="/statements/profit-and-loss" trend={trendFor((m) => m.grossProfit, grossProfit)} unavailableReason={t('notPrintedOnPnl')} />
        <KpiCard label={t('kpiNetIncome')} cents={netIncome.cents} currency={currency} deltaCents={netIncome.deltaCents} deltaPct={netIncome.deltaPct} upIsGood periodLabel={periodLabelFor(netIncome)} how={`${t('howNetIncome')} ${pnlSourceNote}`} href="/statements/profit-and-loss" trend={trendFor((m) => m.netIncome, netIncome)} unavailableReason={t('notPrintedOnPnl')} />
      </div>
      )}

      {modules.statements && (
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <section id="income-expense" className="border-line bg-card flex flex-col rounded-2xl border p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-muted-foreground text-[13px] font-medium">{t('incomeExpenseTitle')}</h2>
              <p className="text-ink mt-1 text-[26px] leading-none font-bold tracking-[-0.02em] tabular-nums">
                {netForPeriod === null ? t('notPrintedOnPnl') : money(netForPeriod)}
              </p>
              <p className="text-muted-foreground mt-1.5 text-[12px]">{t('incomeExpenseNet', { period: selected.label })}</p>
            </div>
            <ul className="flex items-center gap-4 text-[12.5px]">
              <Swatch color="var(--chart-teal)" label={t('seriesIncome')} />
              <Swatch color="var(--chart-amber)" label={t('seriesExpense')} />
            </ul>
          </div>
          <div className="mt-4 flex-1">
            {incomeExpense.length >= 2 ? (
              <IncomeExpenseChart points={incomeExpense} currency={currency} summary={t('incomeExpenseSummary', { count: incomeExpense.length })} />
            ) : (
              <p className="text-muted-foreground text-[14px]">{t('incomeExpenseUnavailable')}</p>
            )}
          </div>
        </section>
        <section className="border-line bg-card flex flex-col rounded-2xl border p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <h2 className="text-ink text-[16px] font-semibold">{t('expensesTitle')}</h2>
          <p className="text-muted-foreground mt-1 text-[13px]">{t('expensesLede')}</p>
          <div className="mt-4 flex-1">{expenses.length > 0 ? <CompositionBars items={expenses} currency={currency} otherLabel={t('other')} /> : <p className="text-muted-foreground text-[14px]">{t('expensesEmpty')}</p>}</div>
        </section>
      </div>
      )}

      {(modules.statements || modules.income_taxes) && (
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        {modules.statements && <InsightsCard insights={insights} currency={currency} />}
        {modules.income_taxes && <IncomeTaxCard obligations={incomeTaxes} currency={currency} today={today} />}
      </div>
      )}

      <div id="reminders" className="mt-6"><RemindersCard reminders={reminders} currency={currency} today={today} /></div>
      <div className="mt-6"><ReportTiles documents={documents.slice(0, 6)} showLibraryLink={documents.length > 0} /></div>
      <NickPanel page="overview" period={periodParam(selected)} businessName={entity.name} />
    </OverviewShell>
  );
}

function OverviewShell({ greeting, subtitle, logoUrl, actions, children }: { greeting: string; subtitle: string; logoUrl?: string | null; actions?: React.ReactNode; children: React.ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-[1200px] px-6 py-10 md:px-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-center gap-4">
          {/* The client's own logo when the firm set one. Decorative: the
              business name is already the accessible text beside it. */}
          {logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- client-supplied host
            <img src={logoUrl} alt="" className="border-line bg-card size-12 shrink-0 rounded-xl border object-contain p-1" />
          )}
          <div>
            <h1 className="text-ink text-[28px] font-bold tracking-[-0.01em]">{greeting}</h1>
            <p className="text-muted-foreground mt-1.5 text-[15px]">{subtitle}</p>
          </div>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
      </div>
      {children}
    </main>
  );
}

function Swatch({ color, label }: { color: string; label: string }) {
  return (
    <li className="text-muted-foreground flex items-center gap-2">
      <span className="size-3 rounded-[4px]" style={{ background: color }} aria-hidden="true" />
      {label}
    </li>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return <section className="border-line bg-card mt-8 rounded-2xl border p-8 shadow-[0_1px_2px_rgba(15,23,42,0.04)]"><h2 className="text-ink text-[18px] font-semibold">{title}</h2><p className="text-muted-foreground mt-2 max-w-[560px] text-[15px] leading-[1.55]">{body}</p></section>;
}
