import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';

import { Sparkline, type SparklineTone } from '@/components/charts/Sparkline';
import { Link } from '@/i18n/navigation';
import { formatCents } from '@/lib/money';

import { InfoTip } from './InfoTip';

// KPI card contract (INITIAL_PROMPT.md §7): value, period, change vs the prior
// comparable period, trend direction, "how is this calculated", link to the
// detail page — the whole card is that link. Color is contextual (`upIsGood`)
// and never the only signal — the arrow and the sign carry it too, so rising
// Cash Out reads red while rising Cash In reads green. A metric that cannot be
// derived shows the reason instead of a number; `trend` is only ever real
// published figures, and with fewer than two of them no sparkline is drawn.
export async function KpiCard({
  label,
  cents,
  currency,
  deltaCents,
  deltaPct,
  upIsGood,
  periodLabel,
  how,
  href,
  trend = [],
  unavailableReason,
}: {
  label: string;
  cents: number | null;
  currency: string;
  deltaCents: number | null;
  deltaPct: number | null;
  upIsGood: boolean;
  periodLabel: string;
  how: string;
  href: string;
  trend?: readonly number[];
  unavailableReason?: string;
}) {
  const [t, locale] = await Promise.all([getTranslations('Overview'), getLocale()]);
  const money = (v: number) => formatCents(v, currency, locale);
  const up = deltaCents !== null && deltaCents > 0;
  const down = deltaCents !== null && deltaCents < 0;
  const good = (up && upIsGood) || (down && !upIsGood);
  const bad = (up && !upIsGood) || (down && upIsGood);
  const tone: SparklineTone = good ? 'positive' : bad ? 'negative' : 'neutral';
  const pill = good ? 'bg-success/10 text-success' : bad ? 'bg-danger/10 text-danger' : 'bg-secondary text-muted-foreground';

  return (
    <article className="group border-line bg-card focus-within:border-blue/40 hover:border-blue/30 relative flex flex-col rounded-2xl border p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-[border-color,box-shadow] hover:shadow-[0_8px_24px_rgba(15,23,42,0.07)]">
      <p className="text-muted-foreground relative z-10 flex items-center gap-1 text-[13px] font-medium">
        {label}
        <InfoTip text={how} label={t('howCalculated')} />
      </p>
      {cents === null ? (
        <p className="text-muted-foreground mt-3 text-[13.5px] leading-snug">{unavailableReason ?? t('noDataPeriod')}</p>
      ) : (
        <>
          <p className="text-ink mt-2 text-[28px] leading-none font-bold tracking-[-0.02em]">{money(cents)}</p>
          <div className="mt-5 flex items-end justify-between gap-3">
            <div className="min-w-0">
              {deltaCents === null ? (
                <p className="text-muted-foreground text-[12px]">{t('noPrior')}</p>
              ) : (
                <>
                  <span className={`inline-flex items-center gap-0.5 rounded-full py-0.5 pr-2 pl-1.5 text-[12.5px] font-semibold ${pill}`}>
                    {up ? <ArrowUpRight className="size-3.5" aria-hidden="true" /> : down ? <ArrowDownRight className="size-3.5" aria-hidden="true" /> : null}
                    {deltaPct !== null ? `${deltaPct > 0 ? '+' : ''}${deltaPct.toFixed(1)}%` : `${deltaCents > 0 ? '+' : ''}${money(deltaCents)}`}
                  </span>
                  <p className="text-muted-foreground mt-1.5 truncate text-[11.5px]">{t('vsPrior', { period: periodLabel })}</p>
                </>
              )}
            </div>
            <Sparkline values={trend} tone={tone} />
            {/* The sparkline is aria-hidden; this is its text equivalent (§1: every chart ships one). */}
            {trend.length >= 2 && (
              <span className="sr-only">
                {t('trendSummary', { count: trend.length, first: money(trend[0] ?? 0), last: money(trend[trend.length - 1] ?? 0) })}
              </span>
            )}
          </div>
        </>
      )}
      <Link href={href} className="focus-visible:ring-blue/40 absolute inset-0 rounded-2xl outline-none focus-visible:ring-3">
        <span className="sr-only">{t('viewDetail')}</span>
      </Link>
    </article>
  );
}
