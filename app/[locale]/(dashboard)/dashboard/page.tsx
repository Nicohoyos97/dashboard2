// Client Overview (INITIAL_PROMPT.md §7): published data only, source-safe
// KPIs read from the published Profit & Loss, deterministic insights,
// reminders and originals. The portal does not track cash flow.
import { getLocale, getTranslations } from 'next-intl/server';

import { NickPanel } from '@/components/chat/NickPanel';
import { CompositionBars } from '@/components/charts/CompositionBars';
import { IncomeExpenseChart } from '@/components/charts/IncomeExpenseChart';
import { DownloadReportsMenu } from '@/components/shell/lazy-menus';
import { IncomeTaxCard } from '@/components/dashboard/IncomeTaxCard';
import { InsightsCard } from '@/components/dashboard/InsightsCard';
import { KpiCard } from '@/components/dashboard/KpiCard';
import { OverviewEmpty, OverviewShell } from '@/components/dashboard/OverviewShell';
import { ReportPeriodBar } from '@/components/dashboard/ReportPeriodBar';
import { SalesTaxOverview } from '@/components/dashboard/SalesTaxOverview';
import { RemindersCard } from '@/components/dashboard/RemindersCard';
import { ReportTiles } from '@/components/dashboard/ReportTiles';
import { Notice } from '@/components/portal/Notice';
import { logAccess } from '@/lib/audit/logAccess';
import { todayIn } from '@/lib/utils/timezone';
import { getCurrentEntity } from '@/lib/auth/getCurrentEntity';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { INSIGHT_PERIODS, insightsAcrossPeriods } from '@/lib/insights/periods';
import { loadPublishedLedgers } from '@/lib/ledger/load';
import { MAX_INSIGHTS } from '@/lib/insights/types';
import {
  loadPortalEntitySettings,
  loadPublishedBankStatements,
  loadPublishedDocuments,
  loadPublishedReports,
  loadInsightDismissals,
  loadReminders,
} from '@/lib/portal/load';
import { DOWNLOAD_MENU_READ, downloadItemsFor } from '@/lib/portal/downloads';
import { type CardKey, type OverviewFigures, overviewFromRange, overviewFromReport } from '@/lib/portal/overview-figures';
import { periodParam } from '@/lib/portal/period-param';
import { periodBarProps, selectPeriod, selectedRange } from '@/lib/portal/report-period';
import { availablePeriods } from '@/lib/reports/periods';
import { loadTaxObligations } from '@/lib/portal/taxes';
import { createClient } from '@/lib/supabase/server';

export default async function OverviewPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const [t, locale, user, entity, params, supabase] = await Promise.all([
    getTranslations('Overview'),
    getLocale(),
    getCurrentUser(),
    getCurrentEntity(),
    searchParams,
    createClient(),
  ]);

  // The same columns the layout reads for the avatar: an identical request is
  // shared within a render instead of being sent twice.
  const profileRead = user
    ? supabase.from('profiles').select('full_name, avatar_url').eq('id', user.id).maybeSingle()
    : Promise.resolve({ data: null });
  const greetingFor = (fullName: string | null | undefined) => {
    const firstName = fullName?.trim().split(/\s+/)[0] ?? '';
    return firstName ? t('greeting', { name: firstName }) : t('greetingAnon');
  };

  if (!entity) {
    const { data: profile } = await profileRead;
    return (
      <OverviewShell greeting={greetingFor(profile?.full_name)} subtitle={t('subtitlePending')}>
        <OverviewEmpty title={t('pendingTitle')} body={t('pendingBody')} />
      </OverviewShell>
    );
  }

  // Everything that needs only the business, in one wave: these used to wait
  // on the profile and then on the settings, one round trip after another. The
  // sales-tax-only client below uses only some of them; the rest cost a
  // parallel read, not a wait.
  const [{ data: profile }, settings, reports, bankStatements, documents, reminders, incomeTaxes, dismissedInsights, publishedLedgers] =
    await Promise.all([
      profileRead,
      loadPortalEntitySettings(supabase, entity.id),
      loadPublishedReports(supabase, entity.id),
      loadPublishedBankStatements(supabase, entity.id),
      // The layout reads the same newest few for its menu: one shared request.
      loadPublishedDocuments(supabase, entity.id, DOWNLOAD_MENU_READ),
      loadReminders(supabase, entity.id),
      loadTaxObligations(supabase, entity.id, 'income'),
      loadInsightDismissals(supabase, entity.id),
      loadPublishedLedgers(supabase, entity.id),
    ]);
  const greeting = greetingFor(profile?.full_name);

  // Everything below reads the Profit & Loss, which a client who bought only
  // sales tax does not have: the period picker, the KPI cards and the charts
  // all resolve to nothing, and even the period itself is derived from
  // published statements, so this client used to land on "no reports published
  // yet". Their Overview is built from the register and the filings instead.
  if (settings.modules.sales_taxes && !settings.modules.bookkeeping) {
    return <SalesTaxOverview entity={entity} settings={settings} greeting={greeting} />;
  }

  const defaultCurrencyStatements = bankStatements.filter((statement) => statement.currency === settings.currency);
  const periods = availablePeriods(reports, defaultCurrencyStatements, { locale }).filter((period) =>
    period.sources.some((source) => source === 'pnl' || source === 'bank'),
  );
  // The figures read the Profit & Loss: a published statement for exactly the
  // dates chosen, or those dates added up (lib/reports/range.ts). A business
  // with bank statements and no P&L keeps its newest published period, whose
  // cards say the statement does not print them.
  const pnlReports = reports.filter((report) => report.reportType === 'profit_and_loss');
  const selection = selectPeriod(pnlReports, params.period);
  const fallback = periods[0] ?? null;
  const downloadItems = downloadItemsFor(documents, locale);

  if (!selection && !fallback) {
    await logAccess({ action: 'dashboard.view', resourceType: 'business_entity', resourceId: entity.id, businessEntityId: entity.id }, { afterResponse: true });
    return (
      <OverviewShell
        greeting={greeting}
        subtitle={t('subtitle', { business: entity.name })}
        logoUrl={settings.logoUrl}
        actions={<DownloadReportsMenu items={downloadItems} />}
      >
        <OverviewEmpty title={t('emptyTitle')} body={t('emptyBody', { business: entity.name })} />
        <div id="reminders" className="mt-6"><RemindersCard reminders={reminders} currency={settings.currency} today={todayIn(settings.timezone)} /></div>
        <div className="mt-6"><ReportTiles documents={documents.slice(0, 6)} showLibraryLink={documents.length > 0} /></div>
        <NickPanel page="overview" businessName={entity.name} />
      </OverviewShell>
    );
  }

  const today = todayIn(settings.timezone);
  const modules = settings.modules;
  const context = {
    supabase,
    entityId: entity.id,
    reports,
    ledgers: publishedLedgers,
    currency: settings.currency,
    balanceSheet: modules.balance_sheet,
    locale,
    t,
  };
  const figures: OverviewFigures = !selection
    ? noPnl(fallback ?? { start: today, end: today, label: '' }, settings.currency)
    : selection.mode === 'report'
      ? await overviewFromReport(context, selection.report)
      : await overviewFromRange(context, selection.requested);
  const shown = selection ? selectedRange(selection) : (fallback ?? { start: today, end: today });
  const currency = figures.currency;
  // The cards dropped the source pill at the owner's request; the source still
  // travels in the "how is this calculated" tooltip (§2 rule 10), and says
  // "entered by your accountant" when there is no document behind the figure.
  const pnlSourceNote = t(
    figures.source === 'entry' ? 'sourceEntryNote' : figures.source === 'range' ? 'sourceRangeNote' : figures.source === 'range_ledger' ? 'sourceRangeLedgerNote' : 'sourceDocumentNote',
  );
  // Insights run over the last few published periods, not only the selected
  // one: the earlier periods get the statement rules, and the selected period
  // gets the full set. Rows this user has already checked off are dropped here.
  const insights = insightsAcrossPeriods(
    { start: figures.range.start, end: figures.range.end, label: figures.label },
    figures.earlier.slice(-(INSIGHT_PERIODS - 1)),
    {
      ...(figures.pnl ? { pnl: figures.pnl } : {}),
      ...(figures.balance ? { balance: figures.balance } : {}),
      reminders,
      reportsNeedingReview: 0,
      today,
    },
    MAX_INSIGHTS + INSIGHT_PERIODS,
    dismissedInsights,
  );
  const incomeExpense = figures.incomeExpense;
  const expenses = figures.expenses;
  const kpi = (key: CardKey, label: string, how: string, upIsGood: boolean) => {
    const c = figures.cards[key];
    return (
      <KpiCard label={label} cents={c.cents} currency={currency} deltaCents={c.deltaCents} deltaPct={c.deltaPct} upIsGood={upIsGood} periodLabel={c.comparedWith} how={`${how} ${pnlSourceNote}`} href={`/statements/profit-and-loss?period=${periodParam(shown)}`} trend={c.trend} unavailableReason={figures.notice ?? t('notPrintedOnPnl')} />
    );
  };

  await logAccess({ action: 'dashboard.view', resourceType: 'business_entity', resourceId: entity.id, businessEntityId: entity.id }, { afterResponse: true });

  // The Overview reads top to bottom as the owner's questions do: how the
  // period went (the four figures), what moved (trend and where the money
  // went), what needs doing (reminders, beside the documents), and what is
  // worth a closer look (insights, beside the income tax).
  const owes = modules.income_taxes;
  return (
    <OverviewShell
      greeting={greeting}
      subtitle={t('subtitlePeriod', { business: entity.name, period: figures.label })}
      logoUrl={settings.logoUrl}
      filters={
        modules.bookkeeping ? (
          <ReportPeriodBar {...periodBarProps({ selected: shown, today, presetLabel: (preset) => t(`preset_${preset}`) })} />
        ) : undefined
      }
      actions={<DownloadReportsMenu items={downloadItems} />}
    >
      {/* Everything below the greeting is module-scoped. The Overview is the
          home of every package, so it shows what the client bought and nothing
          else — a sales-tax-only client has no Profit & Loss for these to read.
          The four figures follow the statement's own order, top to bottom. */}
      {modules.bookkeeping && figures.notice && (
        <Notice text={figures.notice} />
      )}
      {modules.bookkeeping && (
      <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {kpi('revenue', t('kpiGrossIncome'), t('howGrossIncome'), true)}
        {kpi('grossProfit', t('kpiGrossProfit'), t('howGrossProfit'), true)}
        {kpi('operatingExpenses', t('kpiTotalExpenses'), t('howTotalExpenses'), false)}
        {kpi('netIncome', t('kpiNetIncome'), t('howNetIncome'), true)}
      </div>
      )}

      {modules.bookkeeping && (
      <div className="mt-4 grid grid-cols-1 gap-4 sm:mt-6 sm:gap-6 xl:grid-cols-5">
        {/* No headline figure: revenue less operating expenses is a number no
            statement prints, and beside Net Income it read as a second, larger
            profit. The chart says what moved; the cards above say how much. */}
        <section id="income-expense" className="border-line bg-card flex flex-col rounded-2xl border p-5 shadow-card xl:col-span-3">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
            <h2 className="text-ink text-title font-semibold">{t('incomeExpenseTitle')}</h2>
            <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-small">
              <Swatch color="var(--chart-teal)" label={t('seriesIncome')} />
              <Swatch color="var(--chart-amber)" label={t('seriesExpense')} />
            </ul>
          </div>
          <div className="mt-4 flex-1">
            {incomeExpense.length >= 2 ? (
              <IncomeExpenseChart points={incomeExpense} currency={currency} summary={t(figures.source === 'range' || figures.source === 'range_ledger' ? 'incomeExpenseSummaryRange' : 'incomeExpenseSummary', { count: incomeExpense.length })} />
            ) : (
              <p className="text-muted-foreground text-ui">{t('incomeExpenseUnavailable')}</p>
            )}
          </div>
        </section>
        <section className="border-line bg-card flex flex-col rounded-2xl border p-5 shadow-card xl:col-span-2">
          <h2 className="text-ink text-title font-semibold">{t('expensesTitle')}</h2>
          <p className="text-muted-foreground mt-1 text-small">{t('expensesLede')}</p>
          <div className="mt-5 flex-1">{expenses.length > 0 ? <CompositionBars items={expenses} currency={currency} otherLabel={t('other')} /> : <p className="text-muted-foreground text-ui">{t('expensesEmpty')}</p>}</div>
        </section>
      </div>
      )}

      {/* What needs doing and the paper behind it, then the reading: the
          rows pair cards of like height, so neither half of a row is mostly
          empty space beside the other. */}
      <div className="mt-4 grid grid-cols-1 gap-4 sm:mt-6 sm:gap-6 xl:grid-cols-5">
        <div id="reminders" className="flex flex-col *:flex-1 xl:col-span-3">
          <RemindersCard reminders={reminders} currency={currency} today={today} />
        </div>
        <div className="flex flex-col *:flex-1 xl:col-span-2">
          <ReportTiles documents={documents.slice(0, 5)} showLibraryLink={documents.length > 0} />
        </div>
      </div>

      {(modules.bookkeeping || owes) && (
        <div className={`mt-4 grid grid-cols-1 gap-4 sm:mt-6 sm:gap-6 ${modules.bookkeeping && owes ? 'xl:grid-cols-5' : ''}`}>
          {modules.bookkeeping && (
            <div className={`flex flex-col *:flex-1 ${owes ? 'xl:col-span-3' : ''}`}>
              <InsightsCard insights={insights} currency={currency} />
            </div>
          )}
          {owes && (
            <div className={`flex flex-col *:flex-1 ${modules.bookkeeping ? 'xl:col-span-2' : ''}`}>
              <IncomeTaxCard obligations={incomeTaxes} currency={currency} today={today} />
            </div>
          )}
        </div>
      )}
      <NickPanel page="overview" period={figures.nickPeriod} businessName={entity.name} />
    </OverviewShell>
  );
}

/** A business with bank statements and no Profit & Loss: every card says the statement does not print it. */
function noPnl(period: { start: string; end: string; label: string }, currency: string): OverviewFigures {
  const none = { cents: null, deltaCents: null, deltaPct: null, comparedWith: period.label, trend: [] };
  return {
    currency,
    range: { start: period.start, end: period.end },
    label: period.label,
    cards: { revenue: none, grossProfit: none, operatingExpenses: none, netIncome: none },
    source: 'document',
    incomeExpense: [],
    expenses: [],
    pnl: undefined,
    earlier: [],
    balance: null,
    nickPeriod: periodParam(period),
    notice: null,
  };
}

function Swatch({ color, label }: { color: string; label: string }) {
  return (
    <li className="text-muted-foreground flex items-center gap-2">
      <span className="size-2.5 rounded-full" style={{ background: color }} aria-hidden="true" />
      {label}
    </li>
  );
}
