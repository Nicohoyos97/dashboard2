// Income Taxes (INITIAL_PROMPT.md §7). Firm-document or firm-entry rows only.
// Every amount keeps the status the firm gave it and nothing reads as final
// unless `firm_confirmed`; a figure the document does not print is left out
// rather than shown as zero.
import { getLocale, getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';

import { NickPanel } from '@/components/chat/NickPanel';
import { QuerySelector } from '@/components/dashboard/QuerySelector';
import { StatCards, type StatCardItem } from '@/components/dashboard/StatCards';
import { TaxOpportunities } from '@/components/dashboard/TaxOpportunities';
import { TaxYearChart } from '@/components/charts/TaxYearChart';
import { PortalEmpty, PortalPage } from '@/components/portal/PortalPage';
import { ObligationList } from '@/components/taxes/ObligationList';
import { TaxAlerts } from '@/components/taxes/TaxAlerts';
import { logAccess } from '@/lib/audit/logAccess';
import { formatCents } from '@/lib/money';
import { getCurrentEntity } from '@/lib/auth/getCurrentEntity';
import { loadPortalEntitySettings } from '@/lib/portal/load';
import { loadTaxObligations } from '@/lib/portal/taxes';
import { nextDueDate, remainingOwed, sumField, taxAlerts, taxYearSeries } from '@/lib/reports/taxes';
import { todayIn } from '@/lib/utils/timezone';
import { createClient } from '@/lib/supabase/server';
import { formatIsoDate } from '@/lib/utils/dates';

export default async function IncomeTaxesPage({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  const [entity, t, locale, params] = await Promise.all([
    getCurrentEntity(),
    getTranslations('Taxes'),
    getLocale(),
    searchParams,
  ]);

  if (!entity) return <PortalPage title={t('incomeTitle')} lede={t('incomeLede')}><PortalEmpty kind="pending" /></PortalPage>;

  const supabase = await createClient();
  const [settings, all] = await Promise.all([
    loadPortalEntitySettings(supabase, entity.id),
    loadTaxObligations(supabase, entity.id, 'income'),
  ]);
  const currency = settings.currency;
  // The nav hides this page when the firm did not sell the module; the route has
  // to agree, or the URL is a way around the sale.
  if (!settings.modules.income_taxes) notFound();

  await logAccess({
    action: 'income_tax.view',
    resourceType: 'business_entity',
    resourceId: entity.id,
    businessEntityId: entity.id,
    metadata: { obligation_count: all.length },
  });

  if (all.length === 0) {
    return (
      <>
        <PortalPage title={t('incomeTitle')} lede={t('incomeLede')}>
          <PortalEmpty kind="none" title={t('incomeEmptyTitle')} body={t('incomeEmptyBody', { business: entity.name })} />
        </PortalPage>
        <NickPanel page="income_tax" businessName={entity.name} />
      </>
    );
  }

  const years = [...new Set(all.flatMap((o) => (o.taxYear === null ? [] : [o.taxYear])))].sort((a, b) => b - a);
  const requested = Number(params.year);
  const year = years.includes(requested) ? requested : (years[0] ?? null);
  // A record the firm entered without a tax year belongs to no year's filter;
  // it stays visible whichever year is selected rather than vanishing.
  const obligations = year === null ? all : all.filter((o) => o.taxYear === year || o.taxYear === null);

  const today = todayIn(settings.timezone);
  const money = (cents: number) => formatCents(cents, currency, locale);
  const format = (cents: number | null) => (cents === null ? null : money(cents));
  const remaining = remainingOwed(obligations);
  const due = nextDueDate(obligations, today);
  const series = taxYearSeries(all);
  const filed = obligations.filter((o) => o.filingStatus === 'filed' || o.filingStatus === 'amended').length;
  const notFinal = obligations.filter((o) => o.status !== 'firm_confirmed').length;

  const cards: StatCardItem[] = [
    { label: t('cardEstimated'), value: format(sumField(obligations, (o) => o.estimatedCents)), unavailable: t('notPrinted'), badge: { text: t('status_estimated'), tone: 'neutral' } },
    { label: t('cardConfirmed'), value: format(sumField(obligations, (o) => o.confirmedCents)), unavailable: t('notConfirmedYet'), badge: { text: t('status_firm_confirmed'), tone: 'positive' } },
    { label: t('cardPaid'), value: format(sumField(obligations, (o) => o.paidCents)), unavailable: t('nothingRecordedPaid') },
    {
      label: t('cardRemaining'),
      value: remaining === null ? null : money(remaining.cents),
      unavailable: t('notPrinted'),
      ...(remaining ? { detail: t(`basis_${remaining.basis}`) } : {}),
      ...(remaining && remaining.cents > 0 ? { badge: { text: t('status_payable'), tone: 'warning' as const } } : {}),
    },
    { label: t('cardNextDue'), value: due === null ? null : formatIsoDate(due, locale), unavailable: t('noUpcomingDue') },
    { label: t('cardFilings'), value: t('filedOf', { filed, total: obligations.length }) },
  ];

  return (
    <>
      <PortalPage
        title={t('incomeTitle')}
        lede={`${entity.name}${year === null ? '' : ` · ${t('taxYear', { year })}`}`}
        controls={
          years.length > 1 ? (
            <QuerySelector param="year" label={t('taxYearLabel')} options={years.map((value) => ({ value: String(value), label: String(value) }))} current={String(year)} />
          ) : null
        }
      >
        <p className="text-muted-foreground mt-3 text-[12.5px]">{t('incomeSourceNote')}</p>
        {notFinal > 0 && (
          <p className="border-warning/30 bg-warning/10 text-ink mt-4 rounded-xl border px-4 py-3 text-[13px]">{t('notFinalWarning', { count: notFinal })}</p>
        )}

        <div className="mt-6">
          <StatCards items={cards} columns={3} />
        </div>

        <TaxAlerts alerts={taxAlerts(obligations, today)} />

        {series.length >= 1 && (
          <section aria-labelledby="income-tax-trend" className="border-line bg-card mt-6 rounded-2xl border p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <h2 id="income-tax-trend" className="text-ink text-[16px] font-semibold">
              {t('chartTitle')}
            </h2>
            <p className="text-muted-foreground mt-1 text-[13px]">{t('chartLede')}</p>
            <div className="mt-4">
              <TaxYearChart points={series} currency={currency} summary={t('chartSummary', { count: series.length })} />
            </div>
          </section>
        )}

        <TaxOpportunities />

        <section aria-labelledby="income-obligations" className="mt-6">
          <h2 id="income-obligations" className="text-ink text-[16px] font-semibold">
            {t('obligationsTitle')}
          </h2>
          <div className="mt-3">
            <ObligationList obligations={obligations} currency={currency} kind="income" />
          </div>
        </section>
      </PortalPage>
      <NickPanel page="income_tax" businessName={entity.name} />
    </>
  );
}
