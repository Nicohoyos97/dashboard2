import { ArrowDownRight, ArrowUpRight, type LucideIcon } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';

import { Link } from '@/i18n/navigation';

import { InfoTip } from './InfoTip';

export type KpiSource = 'bank' | 'pnl' | 'balance_sheet' | 'firm_entry';

// KPI card contract (INITIAL_PROMPT.md §7): value, period, change vs the prior
// comparable period ($ and %), trend direction, source label, "how is this
// calculated", link to the detail page. Color is contextual (`upIsGood`) and
// never the only signal — the arrow and the sign carry it too. A metric that
// cannot be derived shows the reason instead of a number.
export async function KpiCard({
  label,
  cents,
  currency,
  deltaCents,
  deltaPct,
  upIsGood,
  periodLabel,
  source,
  how,
  href,
  icon: Icon,
  unavailableReason,
}: {
  label: string;
  cents: number | null;
  currency: string;
  deltaCents: number | null;
  deltaPct: number | null;
  upIsGood: boolean;
  periodLabel: string;
  source: KpiSource;
  how: string;
  href: string;
  icon: LucideIcon;
  unavailableReason?: string;
}) {
  const [t, locale] = await Promise.all([getTranslations('Overview'), getLocale()]);
  const money = (v: number) => new Intl.NumberFormat(locale, { style: 'currency', currency }).format(v / 100);
  const up = deltaCents !== null && deltaCents > 0;
  const down = deltaCents !== null && deltaCents < 0;
  const good = (up && upIsGood) || (down && !upIsGood);
  const bad = (up && !upIsGood) || (down && upIsGood);
  const tone = good ? 'bg-success/10 text-success' : bad ? 'bg-danger/10 text-danger' : 'bg-secondary text-muted-foreground';

  return (
    <article className="border-line bg-card flex flex-col rounded-2xl border p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-muted-foreground flex items-center gap-1 text-[13px] font-medium">
            {label}
            <InfoTip text={how} label={t('howCalculated')} />
          </p>
          {cents === null ? (
            <p className="text-muted-foreground mt-2 text-[14px] leading-snug">{unavailableReason ?? t('noDataPeriod')}</p>
          ) : (
            <p className="text-ink mt-1.5 text-[26px] leading-none font-bold tracking-[-0.02em]">{money(cents)}</p>
          )}
        </div>
        <span className="bg-blue-pale text-blue flex size-10 shrink-0 items-center justify-center rounded-xl">
          <Icon className="size-5" aria-hidden="true" />
        </span>
      </div>
      {cents !== null && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[12.5px]">
          {deltaCents !== null ? (
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold ${tone}`}>
              {up ? <ArrowUpRight className="size-3.5" aria-hidden="true" /> : down ? <ArrowDownRight className="size-3.5" aria-hidden="true" /> : null}
              {deltaPct !== null ? `${deltaPct > 0 ? '+' : ''}${deltaPct.toFixed(1)}%` : `${deltaCents > 0 ? '+' : ''}${money(deltaCents)}`}
            </span>
          ) : (
            <span className="text-muted-foreground">{t('noPrior')}</span>
          )}
          {deltaCents !== null && <span className="text-muted-foreground">{t('vsPrior', { period: periodLabel })}</span>}
        </div>
      )}
      <div className="mt-3 flex items-center justify-between gap-3 text-[12px]">
        <span className="bg-secondary text-muted-foreground rounded-full px-2 py-0.5 font-medium">{t(`source_${source}`)}</span>
        <Link href={href} className="text-blue font-semibold hover:underline">
          {t('viewDetail')}
        </Link>
      </div>
    </article>
  );
}
