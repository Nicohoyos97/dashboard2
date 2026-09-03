import { AlertTriangle, Clock, Info } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';

import type { TaxAlert } from '@/lib/reports/taxes';
import { formatIsoDate } from '@/lib/utils/dates';

const TONE = {
  critical: { box: 'border-danger/30 bg-danger/5', icon: 'text-danger', Icon: AlertTriangle },
  warning: { box: 'border-warning/30 bg-warning/5', icon: 'text-warning', Icon: Clock },
  info: { box: 'border-line bg-secondary/40', icon: 'text-muted-foreground', Icon: Info },
} as const;

/**
 * Tax alerts (§7 Sales Taxes): a deterministic rule decided each of these in
 * `taxAlerts`, so the page states a fact — never a prediction. An empty rule
 * set renders nothing rather than a reassuring "all clear" we cannot support.
 */
export async function TaxAlerts({ alerts }: { alerts: readonly TaxAlert[] }) {
  const [t, locale] = await Promise.all([getTranslations('Taxes'), getLocale()]);
  if (alerts.length === 0) return null;

  return (
    <section aria-labelledby="tax-alerts" className="mt-6">
      <h2 id="tax-alerts" className="text-ink text-[16px] font-semibold">
        {t('alertsTitle')}
      </h2>
      <ul className="mt-3 flex flex-col gap-2">
        {alerts.map((alert) => {
          const tone = TONE[alert.tone];
          return (
            <li key={`${alert.obligationId}-${alert.kind}`} className={`flex items-start gap-3 rounded-xl border px-4 py-3 ${tone.box}`}>
              <tone.Icon className={`mt-0.5 size-4 shrink-0 ${tone.icon}`} aria-hidden="true" />
              <div className="min-w-0 text-[13.5px]">
                <p className="text-ink font-semibold">{t(`alert_${alert.kind}`)}</p>
                <p className="text-muted-foreground mt-0.5">
                  {[alert.scope, alert.dueDate ? t('dueOn', { date: formatIsoDate(alert.dueDate, locale) }) : null].filter(Boolean).join(' · ')}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
