// Profit & Loss (INITIAL_PROMPT.md §7): headline cards read from the printed
// totals, expense composition, a trend across published periods, and the
// interactive statement. Only published reports; only periods with data.
import { getLocale, getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';

import { CompositionBars } from '@/components/charts/CompositionBars';
import { NickProvider } from '@/components/chat/NickContext';
import { NickPanel } from '@/components/chat/NickPanel';
import { TrendBars } from '@/components/charts/TrendBars';
import { GranularityTabs } from '@/components/dashboard/GranularityTabs';
import { PeriodPicker } from '@/components/dashboard/PeriodPicker';
import { periodPickerProps } from '@/lib/portal/period-picker';
import { todayIn } from '@/lib/utils/timezone';
import { EmptyStatement } from '@/components/statements/EmptyStatement';
import { MetricCards } from '@/components/statements/MetricCards';
import { StatementActions } from '@/components/statements/StatementActions';
import { PortalPage } from '@/components/portal/PortalPage';
import { StatementTable } from '@/components/statements/StatementTable';
import { resolveComparison } from '@/lib/portal/statement-compare';
import { logAccess } from '@/lib/audit/logAccess';
import { getCurrentEntity } from '@/lib/auth/getCurrentEntity';
import { compositionLinks, ledgerLinks } from '@/lib/ledger/links';
import { loadLedgerDetail } from '@/lib/ledger/load';
import { loadPortalEntitySettings, loadPublishedReports, loadReportLines, loadReportLinesFor } from '@/lib/portal/load';
import { granularityChoices } from '@/lib/portal/granularity';
import { periodParam } from '@/lib/portal/period-param';
import { leafItems, selectReport, statementPeriods } from '@/lib/portal/statement-page';
import { availablePeriods } from '@/lib/reports/periods';
import { PNL_SYNONYMS, type PnlMetricKey, type PnlMetrics, pnlMetrics } from '@/lib/reports/pnl';
import { findSection } from '@/lib/reports/sections';
import { buildTree } from '@/lib/reports/tree';
import { createClient } from '@/lib/supabase/server';
import { comparableSeries } from '@/lib/reports/series';
import { formatPeriod, formatPeriodCompact } from '@/lib/utils/dates';

const TREND_LIMIT = 8;

export default async function ProfitAndLossPage({ searchParams }: { searchParams: Promise<{ period?: string; compare?: string }> }) {
  const [entity, t, tOverview, locale, params] = await Promise.all([getCurrentEntity(), getTranslations('Statements'), getTranslations('Overview'), getLocale(), searchParams]);
  const typeLabel = t('pnlTitle');
  if (!entity) return <PortalPage title={typeLabel} lede={t('pnlLede')}><EmptyStatement kind="pending" typeLabel={typeLabel} /></PortalPage>;

  const supabase = await createClient();
  const settings = await loadPortalEntitySettings(supabase, entity.id);
  // The nav hides this page when the firm did not sell the module; the route has
  // to agree, or the URL is a way around the sale.
  if (!settings.modules.bookkeeping) notFound();
  const reports = (await loadPublishedReports(supabase, entity.id)).filter((r) => r.reportType === 'profit_and_loss');
  const report = selectReport(reports, params.period);
  if (!report) return <PortalPage title={typeLabel} lede={t('pnlLede')}><EmptyStatement kind="none" typeLabel={typeLabel} entityName={entity.name} /></PortalPage>;

  const rows = await loadReportLines(supabase, entity.id, report.id);
  const roots = buildTree(rows);
  // Which column PRIOR is: the comparative the document prints, or another
  // published statement the client chose to sit beside this one.
  const comparison = await resolveComparison({
    supabase,
    entityId: entity.id,
    report,
    reports,
    roots,
    requested: params.compare,
    locale,
    today: todayIn(settings.timezone),
    labels: {
      printed: t('comparePrinted'),
      comparedWith: (period) => t('comparedWithPeriod', { period }),
      preset: (preset) => tOverview(`preset_${preset}`),
    },
  });
  const metrics = pnlMetrics(report, comparison.roots);
  // The month's General Ledger: a click on an account opens its transactions.
  const lineLinks = ledgerLinks(roots, await loadLedgerDetail(supabase, entity.id, report, roots));
  const expenseLinks = compositionLinks(roots, lineLinks);
  const expenses = leafItems(findSection(comparison.roots, PNL_SYNONYMS.operatingExpenses)).map((item) => {
    const href = expenseLinks.get(item.label);
    return href ? { ...item, href } : item;
  });

  // Trend across published periods (oldest → newest), only when there are ≥ 2.
  const trendReports = comparableSeries(reports, report).slice(0, TREND_LIMIT).reverse();
  // Every period's lines in one query rather than one query per period.
  const trendLines =
    trendReports.length >= 2 ? await loadReportLinesFor(supabase, entity.id, trendReports.map((r) => r.id)) : null;
  const trendMetrics = trendLines ? trendReports.map((r) => pnlMetrics(r, buildTree(trendLines.get(r.id) ?? []))) : [];
  const trend = trendLines
    ? trendReports.map((r, index) => {
        const m = trendMetrics[index];
        return { label: formatPeriodCompact(r.periodStart, r.periodEnd, locale), a: m?.revenue.current?.cents ?? null, b: m?.operatingExpenses.current?.cents ?? null };
      })
    : null;
  // The cards' sparklines, by the Overview's rule: the published periods when
  // every one of them prints the figure — a gap is never drawn as a zero —
  // otherwise the two points the card already states, otherwise no shape.
  const sparkOf = (pick: (m: PnlMetrics) => number | null, current: number | null, prior: number | null): number[] => {
    const points = trendMetrics.flatMap((m) => {
      const value = pick(m);
      return value === null ? [] : [value];
    });
    if (points.length === trendMetrics.length && points.length >= 2) return points;
    return current !== null && prior !== null ? [prior, current] : [];
  };
  const moneySpark = (key: PnlMetricKey) =>
    sparkOf((m) => m[key].current?.cents ?? null, metrics[key].current?.cents ?? null, metrics[key].prior?.cents ?? null);

  const periodLabel = formatPeriod(report.periodStart, report.periodEnd, locale);
  // Same rule as the PDF: a statement that prints no method is read on the one set at onboarding.
  const basis = t('basisLabel', { basis: (report.basis ?? settings.accountingBasis) === 'accrual' ? t('basisAccrual') : t('basisCash') });
  const comparative = comparison.note
    ? comparison.note
    : report.comparativeStart && report.comparativeEnd
      ? `${t('comparative')} ${formatPeriod(report.comparativeStart, report.comparativeEnd, locale)}`
      : null;
  // Where the figures came from, once, under them: the basis, the comparison,
  // the source and the promise that nothing on the page is an estimate.
  const provenance = [basis, comparative, t('sourceLabel', { source: report.source === 'firm_entry' ? t('sourceEntry') : t('sourceDocument') })]
    .filter(Boolean)
    .join(' · ');

  await logAccess({ action: 'report.view', resourceType: 'financial_report', resourceId: report.id, businessEntityId: entity.id });

  return (
    <NickProvider>
    <PortalPage
      title={typeLabel}
      lede={`${entity.name} · ${periodLabel}`}
      filters={
        <>
          <GranularityTabs choices={granularityChoices(availablePeriods(reports, [], { locale }), { start: report.periodStart, end: report.periodEnd })} />
          <PeriodPicker
            {...periodPickerProps({
              periods: statementPeriods(reports, locale),
              selected: { start: report.periodStart, end: report.periodEnd, label: '', kind: 'custom', sources: [] },
              today: todayIn(settings.timezone),
              locale,
              presetLabel: (preset) => tOverview(`preset_${preset}`),
            })}
          />
        </>
      }
      actions={<StatementActions versionId={report.documentVersionId} csvHref={`/api/reports/${report.id}/csv`} pdfHref={`/api/reports/${report.id}/pdf`} />}
    >
      <div className="mt-6">
        <MetricCards
          currency={report.currency}
          items={[
            { kind: 'money', label: t('revenue'), metric: metrics.revenue, upIsGood: true, trend: moneySpark('revenue') },
            { kind: 'money', label: t('grossProfit'), metric: metrics.grossProfit, upIsGood: true, trend: moneySpark('grossProfit') },
            { kind: 'money', label: t('operatingExpenses'), metric: metrics.operatingExpenses, upIsGood: false, trend: moneySpark('operatingExpenses') },
            { kind: 'money', label: t('netIncome'), metric: metrics.netIncome, upIsGood: true, trend: moneySpark('netIncome') },
          ]}
          secondary={[
            { kind: 'money', label: t('cogs'), metric: metrics.cogs, upIsGood: false },
            { kind: 'ratio', label: t('grossMargin'), ratio: { key: 'grossMargin', current: metrics.grossMarginPct, prior: metrics.priorGrossMarginPct, ...(metrics.marginReason ? { reason: metrics.marginReason } : {}) }, upIsGood: true, format: 'pct' },
            { kind: 'ratio', label: t('netMargin'), ratio: { key: 'netMargin', current: metrics.netMarginPct, prior: metrics.priorNetMarginPct, ...(metrics.marginReason ? { reason: metrics.marginReason } : {}) }, upIsGood: true, format: 'pct' },
          ]}
          secondaryLabel={t('ratiosLabel')}
        />
      </div>

      <p className="text-muted-foreground mt-3 text-small">
        {provenance}. {t('nothingEstimated')}
      </p>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-2">
        <section className="border-line bg-card rounded-2xl border p-5 shadow-card">
          <h2 className="text-ink text-title font-semibold">{t('compositionExpenses')}</h2>
          <div className="mt-4">
            {expenses.length > 0 ? <CompositionBars items={expenses} currency={report.currency} otherLabel={t('other')} /> : <p className="text-muted-foreground text-ui">{t('notPrinted')}</p>}
          </div>
        </section>
        <section className="border-line bg-card rounded-2xl border p-5 shadow-card">
          <h2 className="text-ink text-title font-semibold">{t('trendRevenueExpenses')}</h2>
          <div className="mt-4">
            {trend ? (
              <TrendBars points={trend} currency={report.currency} seriesA={t('revenue')} seriesB={t('operatingExpenses')} summary={t('trendSummary', { count: trend.length, latest: trend[trend.length - 1]?.label ?? '' })} />
            ) : (
              <p className="text-muted-foreground text-ui">{t('trendUnavailable')}</p>
            )}
          </div>
        </section>
      </div>

      <section className="border-line bg-card mt-6 rounded-2xl border p-5 shadow-card print:border-0 print:shadow-none">
        <StatementTable
          roots={comparison.roots}
          meta={{ reportType: 'profit_and_loss', currency: report.currency, hasPrior: comparison.hasPrior, source: report.source, versionId: report.documentVersionId }}
          details={lineLinks}
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
    <NickPanel page="profit_and_loss" period={periodParam({ start: report.periodStart, end: report.periodEnd })} businessName={entity.name} />
    </NickProvider>
  );
}
