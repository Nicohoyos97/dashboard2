import { getLocale, getTranslations } from 'next-intl/server';

import { NetSalesChart } from '@/components/charts/NetSalesChart';
import { TrendBars } from '@/components/charts/TrendBars';
import { NickPanel } from '@/components/chat/NickPanel';
import { logAccess } from '@/lib/audit/logAccess';
import { loadPublishedDocuments, loadPublishedSalesReports, loadReminders, type PortalEntitySettings } from '@/lib/portal/load';
import { loadTaxObligations } from '@/lib/portal/taxes';
import { taxPaidSeries } from '@/lib/reports/taxes';
import { createClient } from '@/lib/supabase/server';
import { formatPeriod, formatPeriodCompact } from '@/lib/utils/dates';
import { todayIn } from '@/lib/utils/timezone';

import { DownloadReportsMenu } from './DownloadReportsMenu';
import { OverviewCard, OverviewEmpty, OverviewShell } from './OverviewShell';
import { RemindersCard } from './RemindersCard';
import { ReportTiles } from './ReportTiles';

// The Overview a client who bought only sales tax sees.
//
// The statement Overview is built on the Profit & Loss — KPI cards, the income
// vs expense chart, the expense composition, the insights — and this client has
// no Profit & Loss at all, so all of it was already hidden by the module gate
// and they were left with a greeting and a reminder list. What they do have is
// the two facts their engagement is made of: what their register rang up, and
// what they have paid the state on it. Those are the two charts here, and they
// are deliberately kept apart — sales and the tax owed on them describe the
// same month and are routinely mistaken for each other (0022).
//
// Both charts read the same sources as the Sales Taxes page, so a figure never
// disagrees between the two pages: net sales come from the register alone, and
// the payments from the filings alone.

/** How many periods the two charts run over. */
const TREND_LIMIT = 8;

export async function SalesTaxOverview({
  entity,
  settings,
  greeting,
}: {
  entity: { id: string; name: string };
  settings: PortalEntitySettings;
  greeting: string;
}) {
  const [t, taxes, locale, supabase] = await Promise.all([
    getTranslations('Overview'),
    getTranslations('Taxes'),
    getLocale(),
    createClient(),
  ]);

  const [salesReports, obligations, documents, reminders] = await Promise.all([
    loadPublishedSalesReports(supabase, entity.id, TREND_LIMIT),
    loadTaxObligations(supabase, entity.id, 'sales'),
    loadPublishedDocuments(supabase, entity.id),
    loadReminders(supabase, entity.id),
  ]);

  await logAccess({
    action: 'dashboard.view',
    resourceType: 'business_entity',
    resourceId: entity.id,
    businessEntityId: entity.id,
  });

  const currency = settings.currency;
  const today = todayIn(settings.timezone);
  const downloadItems = documents.flatMap((document) =>
    document.currentVersionId
      ? [{
          versionId: document.currentVersionId,
          title: document.title,
          subtitle:
            document.periodStart && document.periodEnd
              ? formatPeriod(document.periodStart, document.periodEnd, locale)
              : '',
        }]
      : [],
  );

  // Oldest first: the loader returns the newest period first, which would draw
  // time running backwards.
  const netPoints = [...salesReports].reverse().map((report) => ({
    label: formatPeriodCompact(report.periodStart, report.periodEnd, locale),
    netSalesCents: report.netSalesCents,
  }));
  // One bar is a legitimate chart, the same rule the payments chart below
  // follows: a client who has published one month has sold one month.
  const netTrend = netPoints.some((point) => point.netSalesCents !== null) ? netPoints : null;

  const paidPoints = taxPaidSeries(obligations, TREND_LIMIT).map((point) => ({
    label: formatPeriodCompact(point.periodStart, point.periodEnd, locale),
    a: point.paidCents,
    b: null,
  }));
  // One bar is a legitimate chart — a client who has filed once has paid once —
  // so a single period is drawn rather than withheld.
  const paidTrend = paidPoints.some((point) => point.a !== null) ? paidPoints : null;

  const nothingPublished = salesReports.length === 0 && obligations.length === 0;

  return (
    <OverviewShell
      greeting={greeting}
      subtitle={t('subtitle', { business: entity.name })}
      logoUrl={settings.logoUrl}
      actions={<DownloadReportsMenu items={downloadItems} />}
    >
      {nothingPublished ? (
        <OverviewEmpty title={t('salesOnlyEmptyTitle')} body={t('salesOnlyEmptyBody', { business: entity.name })} />
      ) : (
        <div className="mt-8 grid gap-6 xl:grid-cols-2">
          <OverviewCard title={taxes('netSalesTitle')} lede={t('netSalesLede')}>
            {netTrend ? (
              <NetSalesChart
                points={netTrend}
                currency={currency}
                labels={{ net: taxes('posNet') }}
                summary={taxes('netSalesSummary', { count: netTrend.length })}
              />
            ) : (
              <p className="text-muted-foreground text-[14px]">{t('netSalesUnavailable')}</p>
            )}
          </OverviewCard>
          <OverviewCard title={t('salesTaxPaidTitle')} lede={t('salesTaxPaidLede')}>
            {paidTrend ? (
              <TrendBars
                points={paidTrend}
                currency={currency}
                seriesA={taxes('amountPaid')}
                summary={t('salesTaxPaidSummary', { count: paidTrend.length })}
              />
            ) : (
              <p className="text-muted-foreground text-[14px]">{t('salesTaxPaidEmpty')}</p>
            )}
          </OverviewCard>
        </div>
      )}

      <div id="reminders" className="mt-6">
        <RemindersCard reminders={reminders} currency={currency} today={today} />
      </div>
      <div className="mt-6">
        <ReportTiles documents={documents.slice(0, 6)} showLibraryLink={documents.length > 0} />
      </div>
      <NickPanel page="overview" businessName={entity.name} />
    </OverviewShell>
  );
}
