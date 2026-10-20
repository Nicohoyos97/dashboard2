// Profit & Loss (INITIAL_PROMPT.md §7): headline cards read from the printed
// totals, expense composition, a trend across published periods, and the
// interactive statement. Only published figures: a published statement for
// exactly the dates chosen, or those dates added up from the published
// statements and, inside a month, its General Ledger (lib/reports/range.ts).
import { getLocale, getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';

import { ReportPeriodBar } from '@/components/dashboard/ReportPeriodBar';
import { EmptyStatement } from '@/components/statements/EmptyStatement';
import { Notice } from '@/components/portal/Notice';
import { ProfitAndLossView } from '@/components/statements/ProfitAndLossView';
import { PortalPage } from '@/components/portal/PortalPage';
import { chosenComparison, resolveComparison } from '@/lib/portal/statement-compare';
import { logAccess } from '@/lib/audit/logAccess';
import { getCurrentEntity } from '@/lib/auth/getCurrentEntity';
import { compositionLinks, ledgerLinks } from '@/lib/ledger/links';
import { ledgerDetailFrom, loadLedgerAccounts, loadPublishedLedgers } from '@/lib/ledger/load';
import { loadPortalEntitySettings, loadPublishedReports, loadReportLinesFor } from '@/lib/portal/load';
import { periodParam } from '@/lib/portal/period-param';
import { rangeFigures, rangeSpark } from '@/lib/portal/range-figures';
import { loadRangeView, periodBarProps, rangeNotice, selectPeriod, selectedRange } from '@/lib/portal/report-period';
import { leafItems } from '@/lib/portal/statement-page';
import { PNL_SYNONYMS, type PnlMetricKey, type PnlMetrics, pnlMetrics } from '@/lib/reports/pnl';
import { findSection } from '@/lib/reports/sections';
import { buildTree } from '@/lib/reports/tree';
import { createClient } from '@/lib/supabase/server';
import { comparableSeries } from '@/lib/reports/series';
import { formatPeriod, formatPeriodCompact } from '@/lib/utils/dates';
import { todayIn } from '@/lib/utils/timezone';

const TREND_LIMIT = 8;
const KEYS: PnlMetricKey[] = ['revenue', 'cogs', 'grossProfit', 'operatingExpenses', 'netIncome'];

export default async function ProfitAndLossPage({ searchParams }: { searchParams: Promise<{ period?: string; compare?: string }> }) {
  const [entity, t, tOverview, locale, params] = await Promise.all([getCurrentEntity(), getTranslations('Statements'), getTranslations('Overview'), getLocale(), searchParams]);
  const typeLabel = t('pnlTitle');
  if (!entity) return <PortalPage title={typeLabel} lede={t('pnlLede')}><EmptyStatement kind="pending" typeLabel={typeLabel} /></PortalPage>;

  const supabase = await createClient();
  // The settings gate the page, but the reads beside them only need the
  // business: one wave instead of three round trips in a row.
  const [settings, allReports, publishedLedgers] = await Promise.all([
    loadPortalEntitySettings(supabase, entity.id),
    loadPublishedReports(supabase, entity.id),
    loadPublishedLedgers(supabase, entity.id),
  ]);
  // The nav hides this page when the firm did not sell the module; the route has
  // to agree, or the URL is a way around the sale.
  if (!settings.modules.bookkeeping) notFound();
  const reports = allReports.filter((r) => r.reportType === 'profit_and_loss');
  const selection = selectPeriod(reports, params.period);
  if (!selection) return <PortalPage title={typeLabel} lede={t('pnlLede')}><EmptyStatement kind="none" typeLabel={typeLabel} entityName={entity.name} /></PortalPage>;

  const today = todayIn(settings.timezone);
  const filters = <ReportPeriodBar {...periodBarProps({ selected: selectedRange(selection), today, presetLabel: (preset) => tOverview(`preset_${preset}`) })} />;
  const basisOf = (basis: string | null) => t('basisLabel', { basis: (basis ?? settings.accountingBasis) === 'accrual' ? t('basisAccrual') : t('basisCash') });

  // ── Dates no single statement covers: added up ─────────────────────────────
  if (selection.mode === 'range') {
    const periodValue = periodParam(selection.requested);
    const view = await loadRangeView(supabase, entity.id, { reports: allReports, ledgers: publishedLedgers, currency: settings.currency }, selection.requested);
    const notice = rangeNotice(view, tOverview, locale);
    if (!view.ok) {
      await logAccess({ action: 'report.view', resourceType: 'business_entity', resourceId: entity.id, businessEntityId: entity.id, metadata: { period: periodValue, refused: view.reason } }, { afterResponse: true });
      return (
        <PortalPage title={typeLabel} lede={`${entity.name} · ${formatPeriod(selection.requested.start, selection.requested.end, locale)}`} filters={filters}>
          {notice && <Notice text={notice} />}
        </PortalPage>
      );
    }
    const figures = rangeFigures(view.statement, view.prior, periodValue);
    const { report, metrics } = figures;
    const expenseLinks = compositionLinks(figures.current, figures.links);
    const sparks = Object.fromEntries(KEYS.map((key) => [key, rangeSpark(figures, (m) => m[key])])) as Record<PnlMetricKey, number[]>;
    const provenance = [
      basisOf(report.basis),
      report.comparativeStart && report.comparativeEnd ? t('comparedWithPrevious', { period: formatPeriod(report.comparativeStart, report.comparativeEnd, locale) }) : null,
      t('sourceLabel', { source: view.statement.fromLedger ? t('sourceRangeLedger') : t('sourceRange') }),
    ].filter(Boolean).join(' · ');

    await logAccess({ action: 'report.view', resourceType: 'business_entity', resourceId: entity.id, businessEntityId: entity.id, metadata: { period: periodValue, statements: figures.pieces.length } }, { afterResponse: true });
    return (
      <ProfitAndLossView
        lede={`${entity.name} · ${formatPeriod(report.periodStart, report.periodEnd, locale)}`}
        filters={filters}
        notice={notice}
        report={report}
        metrics={metrics}
        sparks={sparks}
        provenance={provenance}
        expenses={leafItems(findSection(figures.roots, PNL_SYNONYMS.operatingExpenses)).map((item) => {
          const href = expenseLinks.get(item.label);
          return href ? { ...item, href } : item;
        })}
        trend={figures.pieces.length >= 2
          ? figures.pieces.map((piece) => ({ label: formatPeriodCompact(piece.report.periodStart, piece.report.periodEnd, locale), a: piece.metrics.revenue.current?.cents ?? null, b: piece.metrics.operatingExpenses.current?.cents ?? null }))
          : null}
        trendOfRange
        roots={figures.roots}
        hasPrior={figures.hasPrior}
        details={figures.links}
        exports={{ csv: `/api/reports/range/csv?period=${periodValue}`, pdf: `/api/reports/range/pdf?period=${periodValue}` }}
        businessName={entity.name}
      />
    );
  }

  // ── One published statement ────────────────────────────────────────────────
  const report = selection.report;
  // Every statement this page draws — the one on screen, the one it is compared
  // with, the trend — in one query, and the month's ledger beside it. The
  // statement on screen is in the trend too; it used to be read twice.
  const trendReports = comparableSeries(reports, report).slice(0, TREND_LIMIT).reverse();
  const compared = chosenComparison(reports, report, params.compare);
  const lineIds = [...new Set([report.id, compared?.id, ...(trendReports.length >= 2 ? trendReports.map((r) => r.id) : [])])].filter(
    (id): id is string => id !== undefined,
  );
  const [linesById, ledgerAccounts] = await Promise.all([
    loadReportLinesFor(supabase, entity.id, lineIds),
    loadLedgerAccounts(supabase, entity.id, report, publishedLedgers),
  ]);
  const roots = buildTree(linesById.get(report.id) ?? []);
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
    today,
    labels: {
      printed: t('comparePrinted'),
      comparedWith: (period) => t('comparedWithPeriod', { period }),
      preset: (preset) => tOverview(`preset_${preset}`),
    },
  });
  const metrics = pnlMetrics(report, comparison.roots);
  // The month's General Ledger: a click on an account opens its transactions.
  const lineLinks = ledgerLinks(roots, ledgerDetailFrom(ledgerAccounts, roots));
  const expenseLinks = compositionLinks(roots, lineLinks);

  // Trend across published periods (oldest → newest), only when there are ≥ 2;
  // their lines came with the batch above.
  const trendMetrics = trendReports.length >= 2 ? trendReports.map((r) => pnlMetrics(r, buildTree(linesById.get(r.id) ?? []))) : [];
  // The cards' sparklines, by the Overview's rule: the published periods when
  // every one of them prints the figure — a gap is never drawn as a zero —
  // otherwise the two points the card already states, otherwise no shape.
  const sparkOf = (key: PnlMetricKey): number[] => {
    const points = trendMetrics.flatMap((m: PnlMetrics) => {
      const value = m[key].current?.cents ?? null;
      return value === null ? [] : [value];
    });
    if (points.length === trendMetrics.length && points.length >= 2) return points;
    const current = metrics[key].current?.cents ?? null;
    const prior = metrics[key].prior?.cents ?? null;
    return current !== null && prior !== null ? [prior, current] : [];
  };

  const comparative = comparison.note
    ? comparison.note
    : report.comparativeStart && report.comparativeEnd
      ? `${t('comparative')} ${formatPeriod(report.comparativeStart, report.comparativeEnd, locale)}`
      : null;
  // Where the figures came from, once, under them: the basis, the comparison,
  // the source and the promise that nothing on the page is an estimate.
  const provenance = [basisOf(report.basis), comparative, t('sourceLabel', { source: report.source === 'firm_entry' ? t('sourceEntry') : t('sourceDocument') })]
    .filter(Boolean)
    .join(' · ');

  await logAccess({ action: 'report.view', resourceType: 'financial_report', resourceId: report.id, businessEntityId: entity.id }, { afterResponse: true });

  return (
    <ProfitAndLossView
      lede={`${entity.name} · ${formatPeriod(report.periodStart, report.periodEnd, locale)}`}
      filters={filters}
      notice={null}
      report={report}
      metrics={metrics}
      sparks={Object.fromEntries(KEYS.map((key) => [key, sparkOf(key)])) as Record<PnlMetricKey, number[]>}
      provenance={provenance}
      expenses={leafItems(findSection(comparison.roots, PNL_SYNONYMS.operatingExpenses)).map((item) => {
        const href = expenseLinks.get(item.label);
        return href ? { ...item, href } : item;
      })}
      trend={trendMetrics.length >= 2
        ? trendReports.map((r, index) => ({ label: formatPeriodCompact(r.periodStart, r.periodEnd, locale), a: trendMetrics[index]?.revenue.current?.cents ?? null, b: trendMetrics[index]?.operatingExpenses.current?.cents ?? null }))
        : null}
      roots={comparison.roots}
      hasPrior={comparison.hasPrior}
      details={lineLinks}
      compare={{
        leading: comparison.leading,
        presets: comparison.presets,
        published: comparison.published,
        current: comparison.current,
        currentLabel: comparison.currentLabel,
      }}
      exports={{ csv: `/api/reports/${report.id}/csv`, pdf: `/api/reports/${report.id}/pdf` }}
      nickPeriod={periodParam({ start: report.periodStart, end: report.periodEnd })}
      businessName={entity.name}
    />
  );
}
