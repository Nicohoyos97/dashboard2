// Expenses, read off the published Profit & Loss — what the page shows for a
// business whose expenses reach the portal on its statement rather than on
// bank statements. Every figure is one the statement prints (or a share of a
// printed total, computed in TypeScript); a P&L carries no transactions or
// vendors, so the page shows accounts and says where they come from.
import { getTranslations } from 'next-intl/server';

import { CompositionBars } from '@/components/charts/CompositionBars';
import { TrendBars } from '@/components/charts/TrendBars';
import { NickPanel } from '@/components/chat/NickPanel';
import { PeriodPicker } from '@/components/dashboard/PeriodPicker';
import { StatCards, type StatCardItem } from '@/components/dashboard/StatCards';
import { PortalPage } from '@/components/portal/PortalPage';
import { Link } from '@/i18n/navigation';
import { logAccess } from '@/lib/audit/logAccess';
import { formatCents } from '@/lib/money';
import { loadReportLinesFor } from '@/lib/portal/load';
import { periodParam } from '@/lib/portal/period-param';
import { periodPickerProps } from '@/lib/portal/period-picker';
import { selectReport, statementPeriods } from '@/lib/portal/statement-page';
import { expenseDelta } from '@/lib/reports/expenses';
import { priorPeriod } from '@/lib/reports/periods';
import { type PnlMetrics, pnlMetrics } from '@/lib/reports/pnl';
import { pnlExpenseLines, shareOf } from '@/lib/reports/pnl-expenses';
import { comparableSeries } from '@/lib/reports/series';
import { buildTree } from '@/lib/reports/tree';
import type { Metric, ReportRow } from '@/lib/reports/types';
import type { createClient } from '@/lib/supabase/server';
import { formatPeriod } from '@/lib/utils/dates';

const TREND_LIMIT = 8;

export async function PnlExpensesView({
  supabase,
  entity,
  reports,
  period,
  locale,
  today,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  entity: { id: string; name: string };
  /** Published Profit & Loss reports, newest first; at least one. */
  reports: ReportRow[];
  period: string | undefined;
  locale: string;
  /** todayIn(business timezone). */
  today: string;
}) {
  const [t, tStatements, tOverview] = await Promise.all([
    getTranslations('Expenses'),
    getTranslations('Statements'),
    getTranslations('Overview'),
  ]);
  const report = selectReport(reports, period);
  if (!report) return null;

  const selected = { start: report.periodStart, end: report.periodEnd };
  const priorRange = priorPeriod(selected, locale);
  const priorReport = priorRange
    ? (reports.find((r) => r.periodStart === priorRange.start && r.periodEnd === priorRange.end && r.currency === report.currency) ?? null)
    : null;
  // Oldest → newest, the period on screen last. Same statements the P&L page trends.
  const trendReports = comparableSeries(reports, report).slice(0, TREND_LIMIT).reverse();

  // Every statement's lines in one round trip.
  const ids = [...new Set([report.id, priorReport?.id, ...trendReports.map((r) => r.id)].filter((id): id is string => id !== undefined))];
  const linesById = await loadReportLinesFor(supabase, entity.id, ids);
  const metricsOf = (r: ReportRow) => pnlMetrics(r, buildTree(linesById.get(r.id) ?? []));

  const roots = buildTree(linesById.get(report.id) ?? []);
  const metrics = pnlMetrics(report, roots);
  const priorMetrics = priorReport ? metricsOf(priorReport) : null;
  const trendMetrics = trendReports.map(metricsOf);
  const lines = pnlExpenseLines(roots);
  const operatingLines = lines.filter((line) => line.kind === 'operating');
  const largest = operatingLines[0] ?? lines[0] ?? null;

  const currency = report.currency;
  const money = (cents: number) => formatCents(cents, currency);
  const periodLabel = formatPeriod(report.periodStart, report.periodEnd, locale);

  // What the figure is compared with: the column the statement itself prints,
  // otherwise the published statement for the period before. Never both.
  const printedPrior = report.comparativeStart !== null && report.comparativeEnd !== null;
  const priorLabel = printedPrior
    ? formatPeriod(report.comparativeStart ?? '', report.comparativeEnd ?? '', locale)
    : priorReport && priorRange
      ? priorRange.label
      : null;
  const priorOf = (pick: (m: PnlMetrics) => Metric): number | null =>
    printedPrior ? (pick(metrics).prior?.cents ?? null) : priorMetrics ? (pick(priorMetrics).current?.cents ?? null) : null;

  const card = (label: string, pick: (m: PnlMetrics) => Metric): StatCardItem => {
    const current = pick(metrics).current?.cents ?? null;
    const prior = priorOf(pick);
    const series = trendMetrics.flatMap((m) => {
      const cents = pick(m).current?.cents;
      return cents === undefined || cents === null ? [] : [cents];
    });
    // The published periods when every one prints the figure — a gap is never
    // a zero — otherwise the two points the card already compares.
    const trend =
      series.length === trendMetrics.length && series.length >= 2 ? series : current !== null && prior !== null ? [prior, current] : [];
    return {
      label,
      value: current === null ? null : money(current),
      unavailable: tStatements('notPrinted'),
      deltaPct: current === null ? null : expenseDelta(current, prior).deltaPct,
      ...(priorLabel ? { deltaLabel: t('vsPrior', { period: priorLabel }) } : {}),
      upIsGood: false,
      trend,
    };
  };

  const cards: StatCardItem[] = [
    card(tStatements('operatingExpenses'), (m) => m.operatingExpenses),
    card(tStatements('cogs'), (m) => m.cogs),
    {
      label: t('pnlLargest'),
      value: largest ? largest.label : null,
      unavailable: t('pnlNoLines'),
      ...(largest ? { detail: money(largest.cents) } : {}),
    },
  ];

  const trend =
    trendReports.length >= 2
      ? trendReports.map((r, index) => ({
          label: formatPeriod(r.periodStart, r.periodEnd, locale),
          a: trendMetrics[index]?.operatingExpenses.current?.cents ?? null,
          b: trendMetrics[index]?.cogs.current?.cents ?? null,
        }))
      : null;
  const totals = { operating: metrics.operatingExpenses.current?.cents ?? null, cogs: metrics.cogs.current?.cents ?? null };
  const kindLabel = { operating: tStatements('operatingExpenses'), cogs: tStatements('cogs') };
  const statementHref = `/statements/profit-and-loss?period=${periodParam(selected)}`;

  await logAccess({
    action: 'expenses.view',
    resourceType: 'financial_report',
    resourceId: report.id,
    businessEntityId: entity.id,
    metadata: { source: 'profit_and_loss', line_count: lines.length },
  });

  return (
    <>
      <PortalPage
        title={t('title')}
        lede={`${entity.name} · ${periodLabel}`}
        controls={
          <PeriodPicker
            {...periodPickerProps({
              periods: statementPeriods(reports, locale),
              selected: { ...selected, label: '', kind: 'custom', sources: [] },
              today,
              locale,
              presetLabel: (preset) => tOverview(`preset_${preset}`),
            })}
          />
        }
      >
        <p className="text-muted-foreground mt-3 text-[12.5px]">
          {t('pnlSourceNote')}{' '}
          <Link href={statementHref} className="text-blue font-semibold hover:underline">
            {t('pnlViewStatement')}
          </Link>
        </p>

        <div className="mt-6">
          <StatCards items={cards} columns={3} />
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
          <Section title={t('pnlByAccountTitle')}>
            {operatingLines.some((line) => line.cents > 0) ? (
              <CompositionBars items={operatingLines.map((line) => ({ label: line.label, cents: line.cents }))} currency={currency} otherLabel={t('other')} />
            ) : (
              <Muted text={t('pnlNoLines')} />
            )}
          </Section>
          <Section title={t('pnlTrendTitle')}>
            {trend ? (
              <TrendBars
                points={trend}
                currency={currency}
                seriesA={kindLabel.operating}
                seriesB={kindLabel.cogs}
                summary={tStatements('trendSummary', { count: trend.length, latest: trend[trend.length - 1]?.label ?? '' })}
              />
            ) : (
              <Muted text={tStatements('trendUnavailable')} />
            )}
          </Section>
        </div>

        <Section title={t('pnlTableTitle')} className="mt-6">
          {lines.length === 0 ? (
            <Muted text={t('pnlNoLines')} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[13.5px]">
                <thead className="text-muted-foreground border-line border-b text-[12px] font-semibold tracking-[0.06em] uppercase">
                  <tr>
                    <th scope="col" className="px-3 py-2">{tStatements('colAccount')}</th>
                    <th scope="col" className="hidden px-3 py-2 sm:table-cell">{t('pnlColType')}</th>
                    <th scope="col" className="px-3 py-2 text-right">{t('pnlColAmount')}</th>
                    <th scope="col" className="px-3 py-2 text-right">{t('pnlColShare')}</th>
                  </tr>
                </thead>
                <tbody className="divide-line divide-y">
                  {lines.map((line) => {
                    const share = shareOf(line.cents, totals[line.kind]);
                    return (
                      <tr key={line.id}>
                        <th scope="row" className="px-3 py-2.5 font-normal">
                          <span className="text-ink font-medium">{line.label}</span>
                          {line.group && <span className="text-muted-foreground block text-[12px]">{line.group}</span>}
                          {/* On a phone the type rides under the name, so the amount and its share fit without scrolling. */}
                          <span className="text-muted-foreground block text-[12px] sm:hidden">{kindLabel[line.kind]}</span>
                        </th>
                        <td className="text-muted-foreground hidden px-3 py-2.5 sm:table-cell">{kindLabel[line.kind]}</td>
                        <td className="text-ink px-3 py-2.5 text-right whitespace-nowrap tabular-nums">{money(line.cents)}</td>
                        <td className="text-muted-foreground px-3 py-2.5 text-right whitespace-nowrap tabular-nums">
                          {share === null ? '—' : `${share.toFixed(1)}%`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="text-muted-foreground mt-3 text-[12.5px]">{t('pnlShareNote')}</p>
            </div>
          )}
        </Section>
      </PortalPage>
      <NickPanel page="expenses" period={periodParam(selected)} businessName={entity.name} />
    </>
  );
}

function Section({ title, className = '', children }: { title: string; className?: string; children: React.ReactNode }) {
  return (
    <section className={`border-line bg-card rounded-2xl border p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] ${className}`}>
      <h2 className="text-ink text-[16px] font-semibold">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Muted({ text }: { text: string }) {
  return <p className="text-muted-foreground text-[14px]">{text}</p>;
}
