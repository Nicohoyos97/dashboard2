import { AlertTriangle, ChevronDown, Info, Lightbulb, OctagonAlert } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';

import { Link } from '@/i18n/navigation';
import { formatIsoDate } from '@/lib/utils/dates';

import { DismissInsight } from './DismissInsight';
import { formatCents } from '@/lib/money';

export type InsightView = {
  ruleKey: string;
  severity: 'info' | 'warning' | 'critical';
  params: Record<string, string | number>;
  linkPath: string;
  periodStart: string;
  periodEnd: string;
  periodLabel: string;
};

const ICON = { info: Info, warning: AlertTriangle, critical: OctagonAlert } as const;
/** How many insights show before the rest fold away. */
const VISIBLE = 4;

const TONE = { info: 'bg-blue-pale text-link', warning: 'bg-warning/10 text-warning', critical: 'bg-danger/10 text-danger' } as const;

// Prioritized insights from the deterministic rule set across the last few
// published periods (§7). The rule decides whether an insight exists; the text
// here only phrases it. Each row carries the period it was raised for and a
// circle that checks it off for this user.
export async function InsightsCard({ insights, currency }: { insights: InsightView[]; currency: string }) {
  const [t, tI, tR, locale] = await Promise.all([
    getTranslations('Overview'),
    getTranslations('Insights'),
    getTranslations('Reminders'),
    getLocale(),
  ]);
  const money = (value: number) => formatCents(value, currency);
  const value = (params: InsightView['params'], key: string): number => {
    const item = params[key];
    return typeof item === 'number' ? item : 0;
  };
  const textParams = (insight: InsightView): Record<string, string | number> => {
    const p = insight.params;
    switch (insight.ruleKey) {
      case 'payroll_share_up':
        return { currentPct: value(p, 'currentSharePct'), priorPct: value(p, 'priorSharePct') };
      case 'category_up_material':
        return { account: String(p.account ?? ''), pct: value(p, 'deltaPct'), amount: money(value(p, 'deltaCents')) };
      case 'liabilities_outpacing_assets':
        return { liabilitiesPct: value(p, 'liabilitiesDeltaPct'), assetsPct: value(p, 'assetsDeltaPct') };
      case 'sales_tax_due_soon':
        return { title: tR('reminderType_sales_tax_deadline'), dueDate: formatIsoDate(String(p.dueDate ?? ''), locale) };
      case 'margin_changed':
        return {
          margin: String(p.margin) === 'gross' ? tI('marginGross') : tI('marginNet'),
          points: value(p, 'points'),
          priorPct: value(p, 'priorPct'),
          currentPct: value(p, 'currentPct'),
        };
      default:
        return p;
    }
  };
  // Four is what a glance holds; the rest wait behind one disclosure rather
  // than pushing every card below them down the page.
  const shown = insights.slice(0, VISIBLE);
  const more = insights.slice(VISIBLE);
  const row = (i: InsightView) => {
    const Icon = ICON[i.severity];
    const params = textParams(i);
    return (
      <DismissInsight key={`${i.ruleKey}-${i.periodStart}-${i.periodEnd}`} ruleKey={i.ruleKey} periodStart={i.periodStart} periodEnd={i.periodEnd}>
        <span className="flex items-start gap-3">
          <span className={`flex size-7 shrink-0 items-center justify-center rounded-lg ${TONE[i.severity]}`}>
            <Icon className="size-4" aria-hidden="true" />
          </span>
          <span className="min-w-0 text-ui">
            <span className="text-ink block font-semibold">{tI(`${i.ruleKey}_title`, params)}</span>
            <span className="text-muted-foreground block">{tI(`${i.ruleKey}_body`, params)}</span>
            <span className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1">
              <span className="bg-secondary text-muted-foreground rounded-full px-2 py-0.5 text-micro font-medium">{i.periodLabel}</span>
              <Link href={i.linkPath} className="text-link hover:text-link-hover text-small font-semibold hover:underline">
                {t('viewDetail')}
              </Link>
            </span>
          </span>
        </span>
      </DismissInsight>
    );
  };
  return (
    <section className="border-line bg-card flex flex-col rounded-2xl border p-5 shadow-card">
      <h2 className="text-ink flex items-center gap-2 text-title font-semibold">
        <Lightbulb className="text-link size-[18px]" aria-hidden="true" />
        {t('insightsTitle')}
      </h2>
      {insights.length === 0 ? (
        <p className="text-muted-foreground mt-3 text-ui">{t('insightsEmpty')}</p>
      ) : (
        <>
          <ul className="mt-4 flex flex-col gap-4">{shown.map(row)}</ul>
          {more.length > 0 && (
            <details className="group mt-4">
              <summary className="text-link hover:text-link-hover inline-flex cursor-pointer list-none items-center gap-1 text-small font-semibold [&::-webkit-details-marker]:hidden">
                <ChevronDown className="size-4 transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
                <span className="group-open:hidden">{t('insightsMore', { count: more.length })}</span>
                <span className="hidden group-open:inline">{t('insightsLess')}</span>
              </summary>
              <ul className="mt-4 flex flex-col gap-4">{more.map(row)}</ul>
            </details>
          )}
        </>
      )}
    </section>
  );
}
