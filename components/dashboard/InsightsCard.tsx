import { AlertTriangle, Info, Lightbulb, OctagonAlert } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';

import { Link } from '@/i18n/navigation';
import { formatIsoDate } from '@/lib/utils/dates';

export type InsightView = { ruleKey: string; severity: 'info' | 'warning' | 'critical'; params: Record<string, string | number>; linkPath: string };

const ICON = { info: Info, warning: AlertTriangle, critical: OctagonAlert } as const;
const TONE = { info: 'bg-blue-pale text-blue', warning: 'bg-warning/10 text-warning', critical: 'bg-danger/10 text-danger' } as const;

// 3–5 prioritized insights from the deterministic rule set (§7). The rule
// decides whether an insight exists; the text here only phrases it.
export async function InsightsCard({ insights, currency }: { insights: InsightView[]; currency: string }) {
  const [t, tI, tR, locale] = await Promise.all([
    getTranslations('Overview'),
    getTranslations('Insights'),
    getTranslations('Reminders'),
    getLocale(),
  ]);
  const money = (value: number) => new Intl.NumberFormat(locale, { style: 'currency', currency }).format(value / 100);
  const value = (params: InsightView['params'], key: string): number => {
    const item = params[key];
    return typeof item === 'number' ? item : 0;
  };
  const textParams = (insight: InsightView): Record<string, string | number> => {
    const p = insight.params;
    switch (insight.ruleKey) {
      case 'revenue_up_collections_down':
        return { revenuePct: value(p, 'revenueDeltaPct'), cashPct: value(p, 'cashInDeltaPct') };
      case 'payroll_share_up':
        return { currentPct: value(p, 'currentSharePct'), priorPct: value(p, 'priorSharePct') };
      case 'category_up_material':
        return { account: String(p.account ?? ''), pct: value(p, 'deltaPct'), amount: money(value(p, 'deltaCents')) };
      case 'liabilities_outpacing_assets':
        return { liabilitiesPct: value(p, 'liabilitiesDeltaPct'), assetsPct: value(p, 'assetsDeltaPct') };
      case 'sales_tax_due_soon':
        return { title: tR('reminderType_sales_tax_deadline'), dueDate: formatIsoDate(String(p.dueDate ?? ''), locale) };
      case 'outflow_exceeded_inflow':
        return { net: money(value(p, 'netCents')) };
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
  return (
    <section className="border-line bg-card flex flex-col rounded-2xl border p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <h2 className="text-ink flex items-center gap-2 text-[16px] font-semibold">
        <Lightbulb className="text-blue size-[18px]" aria-hidden="true" />
        {t('insightsTitle')}
      </h2>
      {insights.length === 0 ? (
        <p className="text-muted-foreground mt-3 text-[14px]">{t('insightsEmpty')}</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-3">
          {insights.map((i) => {
            const Icon = ICON[i.severity];
            const params = textParams(i);
            return (
              <li key={i.ruleKey} className="flex items-start gap-3">
                <span className={`mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg ${TONE[i.severity]}`}>
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                <span className="min-w-0 text-[13.5px]">
                  <span className="text-ink block font-semibold">{tI(`${i.ruleKey}_title`, params)}</span>
                  <span className="text-muted-foreground block">{tI(`${i.ruleKey}_body`, params)}</span>
                  <Link href={i.linkPath} className="text-blue mt-0.5 inline-block text-[12.5px] font-semibold hover:underline">
                    {t('viewDetail')}
                  </Link>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
