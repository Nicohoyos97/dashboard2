// Sales Taxes (INITIAL_PROMPT.md §7). Hidden entirely unless the firm enabled
// the module for this business — the route 404s rather than rendering an empty
// shell, so the nav and the URL agree. Multi-jurisdiction and multi-frequency:
// figures are never summed across jurisdictions without saying so.
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';

import { NetSalesChart } from '@/components/charts/NetSalesChart';
import { NickPanel } from '@/components/chat/NickPanel';
import { QuerySelector } from '@/components/dashboard/QuerySelector';
import { StatCards, type StatCardItem } from '@/components/dashboard/StatCards';
import { PortalEmpty, PortalPage } from '@/components/portal/PortalPage';
import { JurisdictionPills } from '@/components/taxes/JurisdictionPills';
import { ObligationList } from '@/components/taxes/ObligationList';
import { RegisterTenders } from '@/components/taxes/RegisterTenders';
import { TaxAlerts } from '@/components/taxes/TaxAlerts';
import { logAccess } from '@/lib/audit/logAccess';
import { formatCents } from '@/lib/money';
import { tenderLabel } from '@/lib/ingestion/schemas/sales-report';
import { getCurrentEntity } from '@/lib/auth/getCurrentEntity';
import { loadPortalEntitySettings } from '@/lib/portal/load';
import { loadPublishedSalesReports } from '@/lib/portal/load';
import { loadSalesTaxJurisdictions, loadTaxObligations } from '@/lib/portal/taxes';
import { nextDueDate, salesTaxCardFigures, taxAlerts } from '@/lib/reports/taxes';
import { todayIn } from '@/lib/utils/timezone';
import { createClient } from '@/lib/supabase/server';
import { formatIsoDate, formatPeriodCompact } from '@/lib/utils/dates';

const TREND_LIMIT = 8;

export default async function SalesTaxesPage({ searchParams }: { searchParams: Promise<{ jurisdiction?: string }> }) {
  const [entity, t, locale, params] = await Promise.all([
    getCurrentEntity(),
    getTranslations('Taxes'),
    getLocale(),
    searchParams,
  ]);

  if (!entity) return <PortalPage title={t('salesTitle')} lede={t('salesLede')}><PortalEmpty kind="pending" /></PortalPage>;

  const supabase = await createClient();
  const settings = await loadPortalEntitySettings(supabase, entity.id);
  if (!settings.salesTaxEnabled) notFound();

  const [all, salesReports, registeredIn] = await Promise.all([
    loadTaxObligations(supabase, entity.id, 'sales'),
    // The client's own register. Read even when there are no filings yet: a
    // business that has sent us a month of sales should see it. Several
    // periods, because the trend beside the breakdown is drawn from them.
    loadPublishedSalesReports(supabase, entity.id, TREND_LIMIT).catch(() => []),
    // Where the firm registered this business — the pills under the title.
    loadSalesTaxJurisdictions(supabase, entity.id),
  ]);
  const latestSales = salesReports[0] ?? null;
  const currency = settings.currency;

  await logAccess({
    action: 'sales_tax.view',
    resourceType: 'business_entity',
    resourceId: entity.id,
    businessEntityId: entity.id,
    metadata: { obligation_count: all.length },
  });

  // The empty state is for a business with nothing at all. A published sales
  // report with no filing yet is not nothing: those are the client's own sales,
  // and they arrive first — the filing follows weeks later.
  if (all.length === 0 && latestSales === null) {
    return (
      <>
        <PortalPage title={t('salesTitle')} lede={t('salesLede')}>
          <PortalEmpty kind="none" title={t('salesEmptyTitle')} body={t('salesEmptyBody', { business: entity.name })} />
        </PortalPage>
        <NickPanel page="sales_tax" businessName={entity.name} />
      </>
    );
  }

  const hasFilings = all.length > 0;
  const jurisdictions = [...new Map(all.flatMap((o) => (o.jurisdiction ? [[o.jurisdiction.code, o.jurisdiction] as const] : []))).values()];
  const selectedCode = jurisdictions.some((j) => j.code === params.jurisdiction) ? (params.jurisdiction ?? '') : '';
  const obligations = selectedCode === '' ? all : all.filter((o) => o.jurisdiction?.code === selectedCode);

  const today = todayIn(settings.timezone);
  const money = (cents: number) => formatCents(cents, currency);
  const format = (cents: number | null) => (cents === null ? null : money(cents));
  const due = nextDueDate(obligations, today);
  const pendingReview = obligations.filter((o) => o.status === 'pending_review').length;

  // Collected / paid / taxable sales are historical totals across the filings on
  // screen; payable is what is still owed, so a settled quarter counts as zero.
  const figures = salesTaxCardFigures(obligations);
  const cards: StatCardItem[] = [
    { label: t('cardCollected'), value: format(figures.collectedCents), unavailable: t('notPrinted') },
    { label: t('cardPaid'), value: format(figures.paidCents), unavailable: t('nothingRecordedPaid') },
    {
      label: t('cardPayable'),
      value: figures.payableCents === null ? null : format(figures.payableCents.cents),
      unavailable: t('notPrinted'),
      ...(figures.payableCents ? { detail: t(`basis_${figures.payableCents.basis}`) } : {}),
    },
    { label: t('cardTaxableSales'), value: format(figures.taxableSalesCents), unavailable: t('notPrinted') },
    { label: t('cardNextFiling'), value: due === null ? null : formatIsoDate(due, locale), unavailable: t('noUpcomingDue') },
  ];

  // The register's own periods, oldest first: the month pills read left to
  // right like the chart beside them. Everything here comes from one
  // point-of-sale report per period, never from a filing.
  const registerPeriods = [...salesReports].reverse();
  const netSeries = registerPeriods.map((report) => ({
    label: formatPeriodCompact(report.periodStart, report.periodEnd, locale),
    netSalesCents: report.netSalesCents,
    tipsCents: report.tipsCents,
    taxCollectedCents: report.taxCollectedCents,
  }));
  const netTrend = netSeries.filter((point) => point.netSalesCents !== null).length >= 2 ? netSeries : null;
  const tenderPeriods = registerPeriods.map((report) => ({
    id: report.id,
    label: formatPeriodCompact(report.periodStart, report.periodEnd, locale),
    collectedCents: report.amountCollectedCents,
    // "DOORDASH" as the report prints it is a record of the document; the
    // client's portal spells the company's name the way it is spelled.
    tenders: report.tenders.map((tender) => ({
      id: tender.id,
      label: tenderLabel(tender.label),
      cents: tender.amountCents,
    })),
  }));

  return (
    <>
      <PortalPage
        title={t('salesTitle')}
        lede={`${entity.name}${selectedCode === '' ? '' : ` · ${jurisdictions.find((j) => j.code === selectedCode)?.name ?? ''}`}`}
        controls={
          jurisdictions.length > 1 ? (
            <QuerySelector
              param="jurisdiction"
              label={t('jurisdictionLabel')}
              options={[{ value: '', label: t('allJurisdictions') }, ...jurisdictions.map((j) => ({ value: j.code, label: j.name }))]}
              current={selectedCode}
            />
          ) : null
        }
      >
        <JurisdictionPills jurisdictions={registeredIn} />
        <p className="text-muted-foreground mt-3 text-[12.5px]">{t('salesSourceNote')}</p>
        {pendingReview > 0 && (
          <p className="border-warning/30 bg-warning/10 text-ink mt-4 rounded-xl border px-4 py-3 text-[13px]">{t('pendingReviewWarning', { count: pendingReview })}</p>
        )}

        {/* Sales first, then what was owed on them: the two describe the same
            month and are routinely confused for each other. */}
        {latestSales && (
          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <RegisterTenders periods={tenderPeriods} currency={currency} />
            <Section title={t('netSalesTitle')}>
              {netTrend ? (
                <NetSalesChart
                  points={netTrend}
                  currency={currency}
                  labels={{ net: t('posNet'), tips: t('posTips'), tax: t('posTaxCollected') }}
                  summary={t('netSalesSummary', { count: netTrend.length })}
                />
              ) : (
                <p className="text-muted-foreground text-[14px]">{t('trendUnavailable')}</p>
              )}
            </Section>
          </div>
        )}

        {hasFilings && (
          <div className="mt-6">
            <StatCards items={cards} columns={3} />
          </div>
        )}
        {!hasFilings && (
          <p className="text-muted-foreground mt-6 text-[14px]">{t('salesNoFilingsYet')}</p>
        )}

        <TaxAlerts alerts={taxAlerts(obligations, today)} />

        <section aria-labelledby="sales-obligations" className="mt-6">
          <h2 id="sales-obligations" className="text-ink text-[16px] font-semibold">
            {t('filingsTitle')}
          </h2>
          <div className="mt-3">
            <ObligationList obligations={obligations} currency={currency} kind="sales" />
          </div>
        </section>
      </PortalPage>
      <NickPanel page="sales_tax" businessName={entity.name} />
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-line bg-card flex flex-col rounded-2xl border p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <h2 className="text-ink text-[18px] font-bold tracking-[-0.01em]">{title}</h2>
      <div className="mt-4 flex-1">{children}</div>
    </section>
  );
}
