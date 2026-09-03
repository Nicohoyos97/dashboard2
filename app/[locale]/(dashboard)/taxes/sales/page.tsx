// Sales Taxes (INITIAL_PROMPT.md §7). Hidden entirely unless the firm enabled
// the module for this business — the route 404s rather than rendering an empty
// shell, so the nav and the URL agree. Multi-jurisdiction and multi-frequency:
// figures are never summed across jurisdictions without saying so.
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';

import { TrendBars } from '@/components/charts/TrendBars';
import { NickPanel } from '@/components/chat/NickPanel';
import { QuerySelector } from '@/components/dashboard/QuerySelector';
import { StatCards, type StatCardItem } from '@/components/dashboard/StatCards';
import { PortalEmpty, PortalPage } from '@/components/portal/PortalPage';
import { ObligationList } from '@/components/taxes/ObligationList';
import { TaxAlerts } from '@/components/taxes/TaxAlerts';
import { logAccess } from '@/lib/audit/logAccess';
import { getCurrentEntity } from '@/lib/auth/getCurrentEntity';
import { loadPortalEntitySettings } from '@/lib/portal/load';
import { loadTaxObligations } from '@/lib/portal/taxes';
import { nextDueDate, salesTaxSeries, sumField, taxAlerts } from '@/lib/reports/taxes';
import { createClient } from '@/lib/supabase/server';
import { formatIsoDate, formatPeriod } from '@/lib/utils/dates';

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

  const all = await loadTaxObligations(supabase, entity.id, 'sales');
  const currency = settings.currency;

  await logAccess({
    action: 'sales_tax.view',
    resourceType: 'business_entity',
    resourceId: entity.id,
    businessEntityId: entity.id,
    metadata: { obligation_count: all.length },
  });

  if (all.length === 0) {
    return (
      <>
        <PortalPage title={t('salesTitle')} lede={t('salesLede')}>
          <PortalEmpty kind="none" title={t('salesEmptyTitle')} body={t('salesEmptyBody', { business: entity.name })} />
        </PortalPage>
        <NickPanel page="sales_tax" businessName={entity.name} />
      </>
    );
  }

  const jurisdictions = [...new Map(all.flatMap((o) => (o.jurisdiction ? [[o.jurisdiction.code, o.jurisdiction] as const] : []))).values()];
  const selectedCode = jurisdictions.some((j) => j.code === params.jurisdiction) ? (params.jurisdiction ?? '') : '';
  const obligations = selectedCode === '' ? all : all.filter((o) => o.jurisdiction?.code === selectedCode);

  const today = new Date().toISOString().slice(0, 10);
  const money = (cents: number) => new Intl.NumberFormat(locale, { style: 'currency', currency }).format(cents / 100);
  const format = (cents: number | null) => (cents === null ? null : money(cents));
  const due = nextDueDate(obligations, today);
  const pendingReview = obligations.filter((o) => o.status === 'pending_review').length;

  const cards: StatCardItem[] = [
    { label: t('cardCollected'), value: format(sumField(obligations, (o) => o.collectedCents)), unavailable: t('notPrinted') },
    { label: t('cardPaid'), value: format(sumField(obligations, (o) => o.paidCents)), unavailable: t('nothingRecordedPaid') },
    { label: t('cardPayable'), value: format(sumField(obligations, (o) => o.payableCents)), unavailable: t('notPrinted') },
    { label: t('cardTaxableSales'), value: format(sumField(obligations, (o) => o.taxableSalesCents)), unavailable: t('notPrinted') },
    { label: t('cardNextFiling'), value: due === null ? null : formatIsoDate(due, locale), unavailable: t('noUpcomingDue') },
    {
      label: t('cardJurisdictions'),
      value: String(jurisdictions.length),
      ...(selectedCode === '' && jurisdictions.length > 1 ? { detail: t('allJurisdictionsNote') } : {}),
    },
  ];

  const series = salesTaxSeries(obligations, (o) =>
    o.periodStart && o.periodEnd ? formatPeriod(o.periodStart, o.periodEnd, locale) : String(o.taxYear ?? ''),
  ).slice(-TREND_LIMIT);
  const trend = series.length >= 2 ? series.map((point) => ({ label: point.label, a: point.collectedCents, b: point.paidCents })) : null;
  const salesTrend =
    series.filter((point) => point.taxableSalesCents !== null).length >= 2
      ? series.map((point) => ({ label: point.label, a: point.taxableSalesCents, b: null }))
      : null;

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
        <p className="text-muted-foreground mt-3 text-[12.5px]">{t('salesSourceNote')}</p>
        {pendingReview > 0 && (
          <p className="border-warning/30 bg-warning/10 text-ink mt-4 rounded-xl border px-4 py-3 text-[13px]">{t('pendingReviewWarning', { count: pendingReview })}</p>
        )}

        <div className="mt-6">
          <StatCards items={cards} columns={3} />
        </div>

        <TaxAlerts alerts={taxAlerts(obligations, today)} />

        <div className="mt-6 grid gap-6 xl:grid-cols-2">
          <Section title={t('collectionsTitle')}>
            {trend ? (
              <TrendBars points={trend} currency={currency} seriesA={t('amountCollected')} seriesB={t('amountPaid')} summary={t('collectionsSummary', { count: trend.length })} />
            ) : (
              <p className="text-muted-foreground text-[14px]">{t('trendUnavailable')}</p>
            )}
          </Section>
          <Section title={t('taxableSalesTitle')}>
            {salesTrend ? (
              <TrendBars points={salesTrend} currency={currency} seriesA={t('amountTaxableSales')} seriesB={t('amountNonTaxableSales')} summary={t('taxableSalesSummary', { count: salesTrend.length })} />
            ) : (
              <p className="text-muted-foreground text-[14px]">{t('trendUnavailable')}</p>
            )}
          </Section>
        </div>

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
    <section className="border-line bg-card rounded-2xl border p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <h2 className="text-ink text-[16px] font-semibold">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}
