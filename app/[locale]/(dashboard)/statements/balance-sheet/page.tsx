// Balance Sheet (INITIAL_PROMPT.md §7): totals, working capital and ratios
// only when the statement prints their inputs, compositions, a trend across
// published dates, and the interactive statement.
import { getLocale, getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';

import { CompositionBars } from '@/components/charts/CompositionBars';
import { NickProvider } from '@/components/chat/NickContext';
import { NickPanel } from '@/components/chat/NickPanel';
import { TrendBars } from '@/components/charts/TrendBars';
import { PeriodSelector } from '@/components/dashboard/PeriodSelector';
import { EmptyStatement } from '@/components/statements/EmptyStatement';
import { MetricCards } from '@/components/statements/MetricCards';
import { StatementActions } from '@/components/statements/StatementActions';
import { StatementTable } from '@/components/statements/StatementTable';
import { logAccess } from '@/lib/audit/logAccess';
import { getCurrentEntity } from '@/lib/auth/getCurrentEntity';
import { loadPortalEntitySettings, loadPublishedReports, loadReportLines } from '@/lib/portal/load';
import { periodParam } from '@/lib/portal/period-param';
import { leafItems, reportPeriodOptions, selectReport } from '@/lib/portal/statement-page';
import { BALANCE_SYNONYMS, balanceSheetMetrics } from '@/lib/reports/balance-sheet';
import { findSection } from '@/lib/reports/sections';
import { buildTree } from '@/lib/reports/tree';
import { comparableSeries } from '@/lib/reports/series';
import { createClient } from '@/lib/supabase/server';
import { formatIsoDate } from '@/lib/utils/dates';

const TREND_LIMIT = 8;

export default async function BalanceSheetPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const [entity, t, locale, params] = await Promise.all([getCurrentEntity(), getTranslations('Statements'), getLocale(), searchParams]);
  const typeLabel = t('bsTitle');
  if (!entity) return <Page title={typeLabel} lede={t('bsLede')}><EmptyStatement kind="pending" typeLabel={typeLabel} /></Page>;

  const supabase = await createClient();
  const settings = await loadPortalEntitySettings(supabase, entity.id);
  // The nav hides this page when the firm did not sell the module; the route has
  // to agree, or the URL is a way around the sale.
  if (!settings.modules.statements) notFound();
  const reports = (await loadPublishedReports(supabase, entity.id)).filter((r) => r.reportType === 'balance_sheet');
  const report = selectReport(reports, params.period);
  if (!report) return <Page title={typeLabel} lede={t('bsLede')}><EmptyStatement kind="none" typeLabel={typeLabel} entityName={entity.name} /></Page>;

  const rows = await loadReportLines(supabase, entity.id, report.id);
  const roots = buildTree(rows);
  const m = balanceSheetMetrics(report, roots);
  const assets = leafItems(findSection(roots, BALANCE_SYNONYMS.totalAssets));
  const liabilities = leafItems(findSection(roots, BALANCE_SYNONYMS.totalLiabilities));
  const hasPrior = rows.some((r) => r.priorCents !== null);

  const trendReports = comparableSeries(reports, report).slice(0, TREND_LIMIT).reverse();
  const trend =
    trendReports.length >= 2
      ? await Promise.all(
          trendReports.map(async (r) => {
            const bm = balanceSheetMetrics(r, buildTree(await loadReportLines(supabase, entity.id, r.id)));
            return { label: formatIsoDate(r.periodEnd, locale), a: bm.totalAssets.current?.cents ?? null, b: bm.totalLiabilities.current?.cents ?? null };
          }),
        )
      : null;

  const asOf = `${t('asOf')} ${formatIsoDate(report.periodEnd, locale)}`;
  const comparative = report.comparativeEnd ? ` · ${t('comparative')} ${formatIsoDate(report.comparativeEnd, locale)}` : '';

  await logAccess({ action: 'report.view', resourceType: 'financial_report', resourceId: report.id, businessEntityId: entity.id });

  return (
    <NickProvider>
    <Page
      title={typeLabel}
      lede={`${entity.name} · ${asOf}${comparative}`}
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
            { kind: 'money', label: t('totalAssets'), metric: m.totalAssets, upIsGood: true },
            { kind: 'money', label: t('totalLiabilities'), metric: m.totalLiabilities, upIsGood: false },
            { kind: 'money', label: t('totalEquity'), metric: m.totalEquity, upIsGood: true },
            { kind: 'money', label: t('workingCapital'), metric: m.workingCapital, upIsGood: true },
            { kind: 'ratio', label: t('currentRatio'), ratio: m.currentRatio, upIsGood: true, format: 'x' },
            { kind: 'ratio', label: t('debtToAsset'), ratio: m.debtToAsset, upIsGood: false, format: 'x' },
          ]}
        />
      </div>

      <p className="text-muted-foreground mt-3 text-[12.5px]">
        {t('granularityNoteAsOf', { date: formatIsoDate(report.periodEnd, locale) })} · {t('sourceLabel', { source: report.source === 'firm_entry' ? t('sourceEntry') : t('sourceDocument') })}
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <section className="border-line bg-card rounded-2xl border p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <h2 className="text-ink text-[16px] font-semibold">{t('compositionAssets')}</h2>
          <div className="mt-4">{assets.length > 0 ? <CompositionBars items={assets} currency={report.currency} otherLabel={t('other')} /> : <p className="text-muted-foreground text-[14px]">{t('notPrinted')}</p>}</div>
        </section>
        <section className="border-line bg-card rounded-2xl border p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <h2 className="text-ink text-[16px] font-semibold">{t('compositionLiabilities')}</h2>
          <div className="mt-4">{liabilities.length > 0 ? <CompositionBars items={liabilities} currency={report.currency} otherLabel={t('other')} /> : <p className="text-muted-foreground text-[14px]">{t('notPrinted')}</p>}</div>
        </section>
        <section className="border-line bg-card rounded-2xl border p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <h2 className="text-ink text-[16px] font-semibold">{t('trendAssetsLiabilities')}</h2>
          <div className="mt-4">
            {trend ? (
              <TrendBars points={trend} currency={report.currency} seriesA={t('totalAssets')} seriesB={t('totalLiabilities')} summary={t('trendSummary', { count: trend.length, latest: trend[trend.length - 1]?.label ?? '' })} />
            ) : (
              <p className="text-muted-foreground text-[14px]">{t('trendUnavailable')}</p>
            )}
          </div>
        </section>
      </div>

      <section className="border-line bg-card mt-6 rounded-2xl border p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] print:border-0 print:shadow-none">
        <StatementTable roots={roots} meta={{ reportType: 'balance_sheet', currency: report.currency, hasPrior, source: report.source, versionId: report.documentVersionId }} />
      </section>
    </Page>
    <NickPanel page="balance_sheet" period={periodParam({ start: report.periodStart, end: report.periodEnd })} businessName={entity.name} />
    </NickProvider>
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
