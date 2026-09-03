// Profit & Loss (INITIAL_PROMPT.md §7): headline cards read from the printed
// totals, expense composition, a trend across published periods, and the
// interactive statement. Only published reports; only periods with data.
import { getLocale, getTranslations } from 'next-intl/server';

import { CompositionBars } from '@/components/charts/CompositionBars';
import { TrendBars } from '@/components/charts/TrendBars';
import { PeriodSelector } from '@/components/dashboard/PeriodSelector';
import { EmptyStatement } from '@/components/statements/EmptyStatement';
import { MetricCards } from '@/components/statements/MetricCards';
import { StatementActions } from '@/components/statements/StatementActions';
import { StatementTable } from '@/components/statements/StatementTable';
import { logAccess } from '@/lib/audit/logAccess';
import { getCurrentEntity } from '@/lib/auth/getCurrentEntity';
import { loadPublishedReports, loadReportLines } from '@/lib/portal/load';
import { periodParam } from '@/lib/portal/period-param';
import { leafItems, reportPeriodOptions, selectReport } from '@/lib/portal/statement-page';
import { PNL_SYNONYMS, pnlMetrics } from '@/lib/reports/pnl';
import { findSection } from '@/lib/reports/sections';
import { buildTree } from '@/lib/reports/tree';
import { createClient } from '@/lib/supabase/server';
import { formatPeriod } from '@/lib/utils/dates';

const TREND_LIMIT = 8;

export default async function ProfitAndLossPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const [entity, t, locale, params] = await Promise.all([getCurrentEntity(), getTranslations('Statements'), getLocale(), searchParams]);
  const typeLabel = t('pnlTitle');
  if (!entity) return <Page title={typeLabel} lede={t('pnlLede')}><EmptyStatement kind="pending" typeLabel={typeLabel} /></Page>;

  const supabase = await createClient();
  const reports = (await loadPublishedReports(supabase, entity.id)).filter((r) => r.reportType === 'profit_and_loss');
  const report = selectReport(reports, params.period);
  if (!report) return <Page title={typeLabel} lede={t('pnlLede')}><EmptyStatement kind="none" typeLabel={typeLabel} entityName={entity.name} /></Page>;

  const rows = await loadReportLines(supabase, entity.id, report.id);
  const roots = buildTree(rows);
  const metrics = pnlMetrics(report, roots);
  const expenses = leafItems(findSection(roots, PNL_SYNONYMS.operatingExpenses));
  const hasPrior = rows.some((r) => r.priorCents !== null);

  // Trend across published periods (oldest → newest), only when there are ≥ 2.
  const trendReports = reports.slice(0, TREND_LIMIT).reverse();
  const trend =
    trendReports.length >= 2
      ? await Promise.all(
          trendReports.map(async (r) => {
            const m = pnlMetrics(r, buildTree(await loadReportLines(supabase, entity.id, r.id)));
            return { label: formatPeriod(r.periodStart, r.periodEnd, locale), a: m.revenue.current?.cents ?? null, b: m.operatingExpenses.current?.cents ?? null };
          }),
        )
      : null;

  const periodLabel = formatPeriod(report.periodStart, report.periodEnd, locale);
  const basis = report.basis ? ` · ${t('basis')}: ${report.basis === 'accrual' ? t('basisAccrual') : t('basisCash')}` : '';
  const comparative = report.comparativeStart && report.comparativeEnd ? ` · ${t('comparative')} ${formatPeriod(report.comparativeStart, report.comparativeEnd, locale)}` : '';

  await logAccess({ action: 'report.view', resourceType: 'financial_report', resourceId: report.id, businessEntityId: entity.id });

  return (
    <Page
      title={typeLabel}
      lede={`${entity.name} · ${periodLabel}${basis}${comparative}`}
      controls={
        <>
          <PeriodSelector options={reportPeriodOptions(reports, locale)} current={periodParam({ start: report.periodStart, end: report.periodEnd })} />
          <StatementActions versionId={report.documentVersionId} csvHref={`/api/reports/${report.id}/csv`} />
        </>
      }
    >
      <div className="mt-6">
        <MetricCards
          currency={report.currency}
          items={[
            { kind: 'money', label: t('revenue'), metric: metrics.revenue, upIsGood: true },
            { kind: 'money', label: t('cogs'), metric: metrics.cogs, upIsGood: false },
            { kind: 'money', label: t('grossProfit'), metric: metrics.grossProfit, upIsGood: true },
            { kind: 'money', label: t('operatingExpenses'), metric: metrics.operatingExpenses, upIsGood: false },
            { kind: 'money', label: t('netIncome'), metric: metrics.netIncome, upIsGood: true },
            { kind: 'ratio', label: t('grossMargin'), ratio: { key: 'grossMargin', current: metrics.grossMarginPct, prior: metrics.priorGrossMarginPct, ...(metrics.marginReason ? { reason: metrics.marginReason } : {}) }, upIsGood: true, format: 'pct' },
            { kind: 'ratio', label: t('netMargin'), ratio: { key: 'netMargin', current: metrics.netMarginPct, prior: metrics.priorNetMarginPct, ...(metrics.marginReason ? { reason: metrics.marginReason } : {}) }, upIsGood: true, format: 'pct' },
          ]}
        />
      </div>

      <p className="text-muted-foreground mt-3 text-[12.5px]">
        {t('granularityNote', { period: periodLabel })} · {t('sourceLabel', { source: report.source === 'firm_entry' ? t('sourceEntry') : t('sourceDocument') })}
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="border-line bg-card rounded-2xl border p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <h2 className="text-ink text-[16px] font-semibold">{t('compositionExpenses')}</h2>
          <div className="mt-4">
            {expenses.length > 0 ? <CompositionBars items={expenses} currency={report.currency} otherLabel={t('other')} /> : <p className="text-muted-foreground text-[14px]">{t('notPrinted')}</p>}
          </div>
        </section>
        <section className="border-line bg-card rounded-2xl border p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <h2 className="text-ink text-[16px] font-semibold">{t('trendRevenueExpenses')}</h2>
          <div className="mt-4">
            {trend ? (
              <TrendBars points={trend} currency={report.currency} seriesA={t('revenue')} seriesB={t('operatingExpenses')} summary={t('trendSummary', { count: trend.length, latest: trend[trend.length - 1]?.label ?? '' })} />
            ) : (
              <p className="text-muted-foreground text-[14px]">{t('trendUnavailable')}</p>
            )}
          </div>
        </section>
      </div>

      <section className="border-line bg-card mt-6 rounded-2xl border p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] print:border-0 print:shadow-none">
        <StatementTable roots={roots} meta={{ reportType: 'profit_and_loss', currency: report.currency, hasPrior, source: report.source, versionId: report.documentVersionId }} />
      </section>
    </Page>
  );
}

function Page({ title, lede, controls, children }: { title: string; lede: string; controls?: React.ReactNode; children: React.ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-[1200px] px-6 py-10 md:px-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-ink text-[28px] font-bold tracking-[-0.01em]">{title}</h1>
          <p className="text-muted-foreground mt-1.5 text-[15px]">{lede}</p>
        </div>
        {controls && <div className="flex flex-wrap items-center gap-3">{controls}</div>}
      </div>
      {children}
    </main>
  );
}
