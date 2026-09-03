// Expenses (INITIAL_PROMPT.md §7). One source: debits on published bank
// statements. Totals are only shown for a period every account's statements
// cover — a missing month is never treated as zero — while the transaction
// list stays available either way. Filters, sort and paging live in the URL.
import { getLocale, getTranslations } from 'next-intl/server';

import { CompositionBars } from '@/components/charts/CompositionBars';
import { MonthlySpendChart } from '@/components/charts/MonthlySpendChart';
import { NickPanel } from '@/components/chat/NickPanel';
import { PeriodSelector } from '@/components/dashboard/PeriodSelector';
import { StatCards, type StatCardItem } from '@/components/dashboard/StatCards';
import { ExpenseFilterBar } from '@/components/expenses/ExpenseFilterBar';
import { ExpenseTable } from '@/components/expenses/ExpenseTable';
import { PortalPage, PortalEmpty } from '@/components/portal/PortalPage';
import { logAccess } from '@/lib/audit/logAccess';
import { getCurrentEntity } from '@/lib/auth/getCurrentEntity';
import {
  EXPENSE_PAGE_SIZE,
  type ExpenseSearchParams,
  parseExpenseQuery,
  sortTransactions,
} from '@/lib/portal/expense-filters';
import {
  loadBankAccounts,
  loadExpenseCategories,
  loadExpenseTransactions,
  loadExpenseVendors,
} from '@/lib/portal/expenses';
import { loadPortalEntitySettings, loadPublishedBankStatements, loadPublishedReports } from '@/lib/portal/load';
import { parsePeriodParam, periodParam } from '@/lib/portal/period-param';
import { byCategory, byVendor, expenseDelta, expenseTotals, expensesByMonth } from '@/lib/reports/expenses';
import { availablePeriods, bankAccountsCoverPeriod, priorPeriod } from '@/lib/reports/periods';
import { createClient } from '@/lib/supabase/server';

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<ExpenseSearchParams> }) {
  const [entity, t, locale, params] = await Promise.all([
    getCurrentEntity(),
    getTranslations('Expenses'),
    getLocale(),
    searchParams,
  ]);
  const path = '/expenses';

  if (!entity) return <PortalPage title={t('title')} lede={t('lede')}><PortalEmpty kind="pending" /></PortalPage>;

  const supabase = await createClient();
  const [settings, reports, statements] = await Promise.all([
    loadPortalEntitySettings(supabase, entity.id),
    loadPublishedReports(supabase, entity.id),
    loadPublishedBankStatements(supabase, entity.id),
  ]);
  const currency = settings.currency;
  const currencyStatements = statements.filter((statement) => statement.currency === currency);
  const periods = availablePeriods(reports, currencyStatements, { locale }).filter((period) => period.sources.includes('bank'));
  const requested = parsePeriodParam(typeof params.period === 'string' ? params.period : undefined);
  const selected = (requested && periods.find((p) => p.start === requested.start && p.end === requested.end)) ?? periods[0] ?? null;

  if (!selected) {
    await logAccess({ action: 'expenses.view', resourceType: 'business_entity', resourceId: entity.id, businessEntityId: entity.id });
    return (
      <PortalPage title={t('title')} lede={t('lede')}>
        <PortalEmpty kind="none" title={t('emptyTitle')} body={t('emptyBody', { business: entity.name })} />
        <NickPanel page="expenses" businessName={entity.name} />
      </PortalPage>
    );
  }

  const accountRanges = currencyStatements.map((s) => ({ bankAccountId: s.bankAccountId, start: s.periodStart, end: s.periodEnd }));
  const covered = bankAccountsCoverPeriod(accountRanges, selected);
  const prior = priorPeriod(selected, locale);
  const priorCovered = prior ? bankAccountsCoverPeriod(accountRanges, prior) : false;
  const { filters, sort, page } = parseExpenseQuery(params);

  const [current, priorTxns, categories, vendors, accounts] = await Promise.all([
    loadExpenseTransactions(supabase, entity.id, currency, selected, filters),
    prior && priorCovered ? loadExpenseTransactions(supabase, entity.id, currency, prior, filters) : Promise.resolve([]),
    loadExpenseCategories(supabase, entity.id),
    loadExpenseVendors(supabase, entity.id, currency, selected),
    loadBankAccounts(supabase, entity.id),
  ]);

  const totals = expenseTotals(current);
  const priorTotals = prior && priorCovered ? expenseTotals(priorTxns) : null;
  const months = expensesByMonth(current, selected);
  const categoryGroups = byCategory(current, t('uncategorized'));
  const vendorGroups = byVendor(current, t('noVendor'));
  const topCategory = categoryGroups[0] ?? null;
  const topVendor = vendorGroups.find((group) => group.key !== '') ?? null;

  const money = (cents: number) => new Intl.NumberFormat(locale, { style: 'currency', currency }).format(cents / 100);
  const unavailable = covered ? undefined : t('incompletePeriod');
  const deltaOf = (currentCents: number, priorCents: number | null) => expenseDelta(currentCents, priorCents).deltaPct;
  // A one-month period has no shape of its own, so the card falls back to the
  // two real totals the delta already compares — same rule as the Overview KPIs.
  const trend =
    months.length >= 2
      ? months.map((month) => month.cents)
      : priorTotals === null
        ? []
        : [priorTotals.totalCents, totals.totalCents];
  const priorLabel = prior ? t('vsPrior', { period: prior.label }) : undefined;

  const cards: StatCardItem[] = [
    {
      label: t('cardTotal'),
      value: covered ? money(totals.totalCents) : null,
      ...(unavailable ? { unavailable } : {}),
      deltaPct: deltaOf(totals.totalCents, priorTotals?.totalCents ?? null),
      ...(priorLabel ? { deltaLabel: priorLabel } : {}),
      upIsGood: false,
      trend,
    },
    {
      label: t('cardOperating'),
      value: covered ? money(totals.byKind.operating) : null,
      ...(unavailable ? { unavailable } : {}),
      deltaPct: deltaOf(totals.byKind.operating, priorTotals?.byKind.operating ?? null),
      upIsGood: false,
    },
    {
      label: t('cardCogs'),
      value: covered ? money(totals.byKind.cogs) : null,
      ...(unavailable ? { unavailable } : {}),
      deltaPct: deltaOf(totals.byKind.cogs, priorTotals?.byKind.cogs ?? null),
      upIsGood: false,
    },
    {
      label: t('cardPayroll'),
      value: covered ? money(totals.byKind.payroll) : null,
      ...(unavailable ? { unavailable } : {}),
      deltaPct: deltaOf(totals.byKind.payroll, priorTotals?.byKind.payroll ?? null),
      upIsGood: false,
    },
    {
      label: t('cardRecurring'),
      value: covered ? money(totals.recurring.yesCents) : null,
      ...(unavailable ? { unavailable } : {}),
      ...(totals.recurring.unknownCents > 0 ? { detail: t('recurringUnknown', { amount: money(totals.recurring.unknownCents) }) } : {}),
      upIsGood: false,
    },
    {
      label: t('cardTopCategory'),
      value: topCategory ? topCategory.label : null,
      unavailable: t('noCategories'),
      ...(topCategory ? { detail: money(topCategory.cents) } : {}),
    },
    {
      label: t('cardTopVendor'),
      value: topVendor ? topVendor.label : null,
      unavailable: t('noVendors'),
      ...(topVendor ? { detail: money(topVendor.cents) } : {}),
    },
    {
      label: t('cardTransactions'),
      value: new Intl.NumberFormat(locale).format(totals.count),
      ...(totals.uncategorizedCents > 0 ? { detail: t('uncategorizedAmount', { amount: money(totals.uncategorizedCents) }) } : {}),
    },
  ];

  const ordered = sortTransactions(current, sort);
  const pageRows = ordered.slice((page - 1) * EXPENSE_PAGE_SIZE, page * EXPENSE_PAGE_SIZE);
  const accountLabels = new Map(accounts.map((account) => [account.id, account.label]));
  const activeFilters = Object.values(filters).filter((value) => value !== null).length;
  const csvQuery = new URLSearchParams(
    Object.entries(params).flatMap(([key, value]) => {
      const first = Array.isArray(value) ? value[0] : value;
      return first === undefined || first === '' || key === 'page' ? [] : [[key, first] as [string, string]];
    }),
  );
  csvQuery.set('period', periodParam(selected));

  await logAccess({
    action: 'expenses.view',
    resourceType: 'business_entity',
    resourceId: entity.id,
    businessEntityId: entity.id,
    metadata: { transaction_count: totals.count },
  });

  return (
    <>
      <PortalPage
        title={t('title')}
        lede={`${entity.name} · ${selected.label}`}
        controls={
          <>
            <PeriodSelector options={periods.map((p) => ({ value: periodParam(p), label: p.label }))} current={periodParam(selected)} />
            <a href={`/api/expenses/csv?${csvQuery.toString()}`} className="border-line bg-card text-ink hover:bg-secondary inline-flex h-10 items-center gap-2 rounded-lg border px-4 text-[14px] font-semibold transition">
              {t('exportCsv')}
            </a>
          </>
        }
      >
        <p className="text-muted-foreground mt-3 text-[12.5px]">{t('sourceNote')}</p>
        {!covered && <p className="border-warning/30 bg-warning/10 text-ink mt-4 rounded-xl border px-4 py-3 text-[13px]">{t('incompletePeriod')}</p>}

        <div className="mt-6">
          <StatCards items={cards} />
        </div>

        <div className="mt-6">
          <ExpenseFilterBar
            path={path}
            period={periodParam(selected)}
            values={{
              category: filters.categoryId ?? '',
              vendor: filters.vendor ?? '',
              account: filters.bankAccountId ?? '',
              recurring: filters.recurring === null ? '' : filters.recurring ? 'yes' : 'no',
              q: filters.search ?? '',
              min: typeof params.min === 'string' ? params.min : '',
              max: typeof params.max === 'string' ? params.max : '',
            }}
            categories={categories.map((category) => ({ value: category.id, label: category.name }))}
            vendors={vendors.map((vendor) => ({ value: vendor, label: vendor }))}
            accounts={accounts.filter((account) => account.currency === currency).map((account) => ({ value: account.id, label: account.label }))}
            activeCount={activeFilters}
          />
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-[3fr_2fr]">
          <Section title={t('trendTitle')}>
            {months.length >= 2 ? (
              <MonthlySpendChart months={months} currency={currency} seriesLabel={t('cardTotal')} summary={t('trendSummary', { months: months.length, total: money(totals.totalCents) })} />
            ) : (
              <Muted text={months.length === 1 ? t('trendSingleMonth') : t('tableEmpty')} />
            )}
          </Section>
          <Section title={t('byCategoryTitle')}>
            {categoryGroups.length > 0 ? (
              <CompositionBars items={categoryGroups.map((group) => ({ label: group.label, cents: group.cents }))} currency={currency} otherLabel={t('other')} />
            ) : (
              <Muted text={t('noCategories')} />
            )}
          </Section>
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-2">
          <Section title={t('byVendorTitle')}>
            {vendorGroups.some((group) => group.key !== '') ? (
              <CompositionBars items={vendorGroups.map((group) => ({ label: group.label, cents: group.cents }))} currency={currency} otherLabel={t('other')} />
            ) : (
              <Muted text={t('noVendors')} />
            )}
          </Section>
          <Section title={t('recurringTitle')} lede={t('recurringLede')}>
            {totals.totalCents > 0 ? (
              <CompositionBars
                items={[
                  { label: t('recurringYes'), cents: totals.recurring.yesCents },
                  { label: t('recurringNo'), cents: totals.recurring.noCents },
                  { label: t('recurringUnknownLabel'), cents: totals.recurring.unknownCents },
                ]}
                currency={currency}
                otherLabel={t('other')}
              />
            ) : (
              <Muted text={t('tableEmpty')} />
            )}
          </Section>
        </div>

        <Section title={t('tableTitle')} className="mt-6">
          <ExpenseTable
            rows={pageRows}
            total={ordered.length}
            page={page}
            pageSize={EXPENSE_PAGE_SIZE}
            sort={sort}
            path={path}
            params={params}
            currency={currency}
            accountLabels={accountLabels}
          />
        </Section>
      </PortalPage>
      <NickPanel page="expenses" period={periodParam(selected)} businessName={entity.name} />
    </>
  );
}

function Section({ title, lede, className = '', children }: { title: string; lede?: string; className?: string; children: React.ReactNode }) {
  return (
    <section className={`border-line bg-card rounded-2xl border p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] ${className}`}>
      <h2 className="text-ink text-[16px] font-semibold">{title}</h2>
      {lede && <p className="text-muted-foreground mt-1 text-[13px]">{lede}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Muted({ text }: { text: string }) {
  return <p className="text-muted-foreground text-[14px]">{text}</p>;
}
