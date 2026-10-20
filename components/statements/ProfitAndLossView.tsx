// The Profit & Loss page's body, whether the figures are one published
// statement or a range added up from several (app/[locale]/(dashboard)/
// statements/profit-and-loss/page.tsx works out which). Same cards, charts and
// table either way, so a client moving from "last month" to "August 15 –
// September 15" reads the same page.
import { getTranslations } from 'next-intl/server';

import { CompositionBars } from '@/components/charts/CompositionBars';
import { NickProvider } from '@/components/chat/NickContext';
import { NickPanel } from '@/components/chat/NickPanel';
import { TrendBars } from '@/components/charts/TrendBars';
import { Notice } from '@/components/portal/Notice';
import { PortalPage } from '@/components/portal/PortalPage';
import type { CompareProps } from '@/components/statements/CompareSelector';
import { MetricCards } from '@/components/statements/MetricCards';
import { StatementActions } from '@/components/statements/StatementActions';
import { type LineDetails, StatementTable } from '@/components/statements/StatementTable';
import type { PnlMetricKey, PnlMetrics } from '@/lib/reports/pnl';
import type { LineNode, ReportRow } from '@/lib/reports/types';

export type ProfitAndLossViewProps = {
  lede: string;
  filters: React.ReactNode;
  /** Why the figures cover what they cover, when a range was cut to the published days. */
  notice: string | null;
  report: ReportRow;
  metrics: PnlMetrics;
  /** Each headline card's sparkline: the trend's points, else the two it compares, else none. */
  sparks: Record<PnlMetricKey, number[]>;
  provenance: string;
  expenses: { label: string; cents: number; href?: string }[];
  trend: { label: string; a: number | null; b: number | null }[] | null;
  /** The trend's bars are the pieces of a range rather than published periods. */
  trendOfRange?: boolean;
  roots: LineNode[];
  hasPrior: boolean;
  details: LineDetails;
  compare?: CompareProps;
  exports: { csv: string; pdf: string };
  /** The period Nick is told the page is about; only a published statement's. */
  nickPeriod?: string;
  businessName: string;
};

export async function ProfitAndLossView(props: ProfitAndLossViewProps) {
  const t = await getTranslations('Statements');
  const { report, metrics, sparks } = props;
  return (
    <NickProvider>
      <PortalPage
        title={t('pnlTitle')}
        lede={props.lede}
        filters={props.filters}
        actions={<StatementActions versionId={report.documentVersionId} csvHref={props.exports.csv} pdfHref={props.exports.pdf} />}
      >
        {props.notice && <Notice text={props.notice} />}
        <div className="mt-6">
          <MetricCards
            currency={report.currency}
            items={[
              { kind: 'money', label: t('revenue'), metric: metrics.revenue, upIsGood: true, trend: sparks.revenue },
              { kind: 'money', label: t('grossProfit'), metric: metrics.grossProfit, upIsGood: true, trend: sparks.grossProfit },
              { kind: 'money', label: t('operatingExpenses'), metric: metrics.operatingExpenses, upIsGood: false, trend: sparks.operatingExpenses },
              { kind: 'money', label: t('netIncome'), metric: metrics.netIncome, upIsGood: true, trend: sparks.netIncome },
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
          {props.provenance}. {t('nothingEstimated')}
        </p>

        <div className="mt-6 grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-2">
          <section className="border-line bg-card rounded-2xl border p-5 shadow-card">
            <h2 className="text-ink text-title font-semibold">{t('compositionExpenses')}</h2>
            <div className="mt-4">
              {props.expenses.length > 0 ? <CompositionBars items={props.expenses} currency={report.currency} otherLabel={t('other')} /> : <p className="text-muted-foreground text-ui">{t('notPrinted')}</p>}
            </div>
          </section>
          <section className="border-line bg-card rounded-2xl border p-5 shadow-card">
            <h2 className="text-ink text-title font-semibold">{t('trendRevenueExpenses')}</h2>
            <div className="mt-4">
              {props.trend ? (
                <TrendBars points={props.trend} currency={report.currency} seriesA={t('revenue')} seriesB={t('operatingExpenses')} summary={t(props.trendOfRange ? 'trendSummaryRange' : 'trendSummary', { count: props.trend.length, latest: props.trend[props.trend.length - 1]?.label ?? '' })} />
              ) : (
                <p className="text-muted-foreground text-ui">{t('trendUnavailable')}</p>
              )}
            </div>
          </section>
        </div>

        <section className="border-line bg-card mt-6 rounded-2xl border p-5 shadow-card print:border-0 print:shadow-none">
          <StatementTable
            roots={props.roots}
            meta={{ reportType: 'profit_and_loss', currency: report.currency, hasPrior: props.hasPrior, source: report.source, versionId: report.documentVersionId }}
            details={props.details}
            {...(props.compare ? { compare: props.compare } : {})}
          />
        </section>
      </PortalPage>
      <NickPanel page="profit_and_loss" {...(props.nickPeriod ? { period: props.nickPeriod } : {})} businessName={props.businessName} />
    </NickProvider>
  );
}
