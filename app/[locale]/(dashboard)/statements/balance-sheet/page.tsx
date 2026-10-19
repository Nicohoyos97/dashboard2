// Balance Sheet (INITIAL_PROMPT.md §7): totals, working capital and ratios
// only when the statement prints their inputs, compositions, a trend across
// published dates, and the interactive statement.
import { getLocale, getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';

import { CompositionBars } from '@/components/charts/CompositionBars';
import { NickProvider } from '@/components/chat/NickContext';
import { NickPanel } from '@/components/chat/NickPanel';
import { TrendBars } from '@/components/charts/TrendBars';
import { PeriodPicker } from '@/components/dashboard/PeriodPicker';
import { periodPickerProps } from '@/lib/portal/period-picker';
import { todayIn } from '@/lib/utils/timezone';
import { EmptyStatement } from '@/components/statements/EmptyStatement';
import { MetricCards } from '@/components/statements/MetricCards';
import { StatementActions } from '@/components/statements/StatementActions';
import { PortalPage } from '@/components/portal/PortalPage';
import { StatementTable } from '@/components/statements/StatementTable';
import { chosenComparison, resolveComparison } from '@/lib/portal/statement-compare';
import { logAccess } from '@/lib/audit/logAccess';
import { getCurrentEntity } from '@/lib/auth/getCurrentEntity';
import { loadPortalEntitySettings, loadPublishedReports, loadReportLinesFor } from '@/lib/portal/load';
import { periodParam } from '@/lib/portal/period-param';
import { leafItems, selectReport, statementPeriods } from '@/lib/portal/statement-page';
import { BALANCE_SYNONYMS, balanceSheetMetrics } from '@/lib/reports/balance-sheet';
import { findSection } from '@/lib/reports/sections';
import { buildTree } from '@/lib/reports/tree';
import { comparableSeries } from '@/lib/reports/series';
import { createClient } from '@/lib/supabase/server';
import { formatIsoDate } from '@/lib/utils/dates';

const TREND_LIMIT = 8;

export default async function BalanceSheetPage({ searchParams }: { searchParams: Promise<{ period?: string; compare?: string }> }) {
  const [entity, t, tOverview, locale, params] = await Promise.all([getCurrentEntity(), getTranslations('Statements'), getTranslations('Overview'), getLocale(), searchParams]);
  const typeLabel = t('bsTitle');
  if (!entity) return <PortalPage title={typeLabel} lede={t('bsLede')}><EmptyStatement kind="pending" typeLabel={typeLabel} /></PortalPage>;

  const supabase = await createClient();
  // The settings gate the page; the reports beside them only need the business.
  const [settings, allReports] = await Promise.all([
    loadPortalEntitySettings(supabase, entity.id),
    loadPublishedReports(supabase, entity.id),
  ]);
  // The nav hides this page when the firm did not sell the add-on; the route
  // has to agree, or the URL is a way around the sale.
  if (!settings.modules.balance_sheet) notFound();
  const reports = allReports.filter((r) => r.reportType === 'balance_sheet');
  const report = selectReport(reports, params.period);
  if (!report) return <PortalPage title={typeLabel} lede={t('bsLede')}><EmptyStatement kind="none" typeLabel={typeLabel} entityName={entity.name} /></PortalPage>;

  // The statement on screen, the one it is compared with and the trend, in
  // one query (the statement on screen is in the trend too).
  const trendReports = comparableSeries(reports, report).slice(0, TREND_LIMIT).reverse();
  const compared = chosenComparison(reports, report, params.compare);
  const linesById = await loadReportLinesFor(
    supabase,
    entity.id,
    [...new Set([report.id, compared?.id, ...(trendReports.length >= 2 ? trendReports.map((r) => r.id) : [])])].filter(
      (id): id is string => id !== undefined,
    ),
  );
  const roots = buildTree(linesById.get(report.id) ?? []);
  const assets = leafItems(findSection(roots, BALANCE_SYNONYMS.totalAssets));
  const liabilities = leafItems(findSection(roots, BALANCE_SYNONYMS.totalLiabilities));
  // Which column PRIOR is: the comparative the document prints, or another
  // published statement the client chose to sit beside this one.
  const comparison = await resolveComparison({
    supabase,
    entityId: entity.id,
    report,
    reports,
    roots,
    requested: params.compare,
    preloaded: linesById,
    locale,
    today: todayIn(settings.timezone),
    labels: {
      printed: t('comparePrinted'),
      comparedWith: (period) => t('comparedWithPeriod', { period }),
      preset: (preset) => tOverview(`preset_${preset}`),
    },
  });
  // The cards read the same comparison the table does, so the screen never
  // shows two changes measured against different periods.
  const m = balanceSheetMetrics(report, comparison.roots);

  // Trend across published dates, only when there are ≥ 2; their lines came with the batch above.
  const trendLines = trendReports.length >= 2 ? linesById : null;
  const trend = trendLines
    ? trendReports.map((r) => {
        const bm = balanceSheetMetrics(r, buildTree(trendLines.get(r.id) ?? []));
        return { label: formatIsoDate(r.periodEnd, locale), a: bm.totalAssets.current?.cents ?? null, b: bm.totalLiabilities.current?.cents ?? null };
      })
    : null;

  const asOf = `${t('asOf')} ${formatIsoDate(report.periodEnd, locale)}`;
  const comparative = report.comparativeEnd ? `${t('comparative')} ${formatIsoDate(report.comparativeEnd, locale)}` : null;
  // Where the figures came from, once, under them: the comparison, the source
  // and the promise that nothing on the page is an estimate.
  const provenance = [comparative, t('sourceLabel', { source: report.source === 'firm_entry' ? t('sourceEntry') : t('sourceDocument') })]
    .filter(Boolean)
    .join(' · ');

  await logAccess({ action: 'report.view', resourceType: 'financial_report', resourceId: report.id, businessEntityId: entity.id }, { afterResponse: true });

  return (
    <NickProvider>
    <PortalPage
      title={typeLabel}
      lede={`${entity.name} · ${asOf}`}
      filters={
        <PeriodPicker
          {...periodPickerProps({
            periods: statementPeriods(reports, locale),
            selected: { start: report.periodStart, end: report.periodEnd, label: '', kind: 'custom', sources: [] },
            today: todayIn(settings.timezone),
            locale,
            presetLabel: (preset) => tOverview(`preset_${preset}`),
          })}
        />
      }
      actions={<StatementActions versionId={report.documentVersionId} csvHref={`/api/reports/${report.id}/csv`} pdfHref={`/api/reports/${report.id}/pdf`} />}
    >
      <div className="mt-6">
        <MetricCards
          currency={report.currency}
          items={[
            { kind: 'money', label: t('totalAssets'), metric: m.totalAssets, upIsGood: true },
            { kind: 'money', label: t('totalLiabilities'), metric: m.totalLiabilities, upIsGood: false },
            { kind: 'money', label: t('totalEquity'), metric: m.totalEquity, upIsGood: true },
            { kind: 'money', label: t('workingCapital'), metric: m.workingCapital, upIsGood: true },
          ]}
          secondary={[
            { kind: 'ratio', label: t('currentRatio'), ratio: m.currentRatio, upIsGood: true, format: 'x' },
            { kind: 'ratio', label: t('debtToAsset'), ratio: m.debtToAsset, upIsGood: false, format: 'x' },
          ]}
          secondaryLabel={t('bsRatiosLabel')}
        />
      </div>

      <p className="text-muted-foreground mt-3 text-small">
        {provenance}. {t('nothingEstimated')}
      </p>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-3">
        <section className="border-line bg-card rounded-2xl border p-5 shadow-card">
          <h2 className="text-ink text-title font-semibold">{t('compositionAssets')}</h2>
          <div className="mt-4">{assets.length > 0 ? <CompositionBars items={assets} currency={report.currency} otherLabel={t('other')} /> : <p className="text-muted-foreground text-ui">{t('notPrinted')}</p>}</div>
        </section>
        <section className="border-line bg-card rounded-2xl border p-5 shadow-card">
          <h2 className="text-ink text-title font-semibold">{t('compositionLiabilities')}</h2>
          <div className="mt-4">{liabilities.length > 0 ? <CompositionBars items={liabilities} currency={report.currency} otherLabel={t('other')} /> : <p className="text-muted-foreground text-ui">{t('notPrinted')}</p>}</div>
        </section>
        <section className="border-line bg-card rounded-2xl border p-5 shadow-card">
          <h2 className="text-ink text-title font-semibold">{t('trendAssetsLiabilities')}</h2>
          <div className="mt-4">
            {trend ? (
              <TrendBars points={trend} currency={report.currency} seriesA={t('totalAssets')} seriesB={t('totalLiabilities')} summary={t('trendSummary', { count: trend.length, latest: trend[trend.length - 1]?.label ?? '' })} />
            ) : (
              <p className="text-muted-foreground text-ui">{t('trendUnavailable')}</p>
            )}
          </div>
        </section>
      </div>

      <section className="border-line bg-card mt-6 rounded-2xl border p-5 shadow-card print:border-0 print:shadow-none">
        <StatementTable
          roots={comparison.roots}
          meta={{ reportType: 'balance_sheet', currency: report.currency, hasPrior: comparison.hasPrior, source: report.source, versionId: report.documentVersionId }}
          compare={{
            leading: comparison.leading,
            presets: comparison.presets,
            published: comparison.published,
            current: comparison.current,
            currentLabel: comparison.currentLabel,
          }}
        />
      </section>
    </PortalPage>
    <NickPanel page="balance_sheet" period={periodParam({ start: report.periodStart, end: report.periodEnd })} businessName={entity.name} />
    </NickProvider>
  );
}
