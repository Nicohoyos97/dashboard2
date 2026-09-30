import { getTranslations } from 'next-intl/server';

import { Sparkline } from '@/components/charts/Sparkline';
import { Link } from '@/i18n/navigation';
import { formatCents } from '@/lib/money';

import { DeltaPill, deltaTone } from './DeltaPill';
import { InfoTip } from './InfoTip';

// KPI card contract (INITIAL_PROMPT.md §7): value, period, change vs the prior
// comparable period, trend direction, "how is this calculated", link to the
// detail page — the whole card is that link. Laid out like the
// hoyosbaker-voice KPI card: label and change pill on one row, the figure,
// then "vs <period>" with the trend bleeding into the corner. Color is
// contextual (`upIsGood`) and never the only signal — the arrow and the sign
// carry it too, so rising Total Expenses reads red while rising Gross Income
// reads green. A metric that cannot be derived shows the reason instead of a
// number; `trend` is only ever real published figures, and with fewer than two
// of them the card draws a dashed rule rather than a shape.
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
  const t = await getTranslations('Overview');
  const money = (v: number) => formatCents(v, currency);
  // The change as it will be read, so a figure that prints as 0.0% is flat.
  const change = deltaPct !== null ? Number(deltaPct.toFixed(1)) : deltaCents;
  const magnitude =
    deltaPct !== null ? `${Math.abs(deltaPct).toFixed(1)}%` : deltaCents !== null ? money(Math.abs(deltaCents)) : null;

  return (
    <article className="group border-line bg-card focus-within:border-blue/40 hover:border-blue/30 relative flex flex-col overflow-hidden rounded-2xl border p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-[border-color,box-shadow] hover:shadow-[0_8px_24px_rgba(15,23,42,0.07)]">
      <div className="flex items-start justify-between gap-2">
        <p className="text-muted-foreground relative z-10 flex items-center gap-1 text-[13px] font-medium">
          {label}
          <InfoTip text={how} label={t('howCalculated')} />
        </p>
        {cents !== null && change !== null && magnitude !== null && (
          <DeltaPill change={change} magnitude={magnitude} upIsGood={upIsGood} />
        )}
      </div>
      {cents === null ? (
        <p className="text-muted-foreground mt-3 text-[13.5px] leading-snug">{unavailableReason ?? t('noDataPeriod')}</p>
      ) : (
        <>
          <p className="text-ink mt-1 text-[28px] leading-tight font-bold tracking-[-0.02em] tabular-nums">{money(cents)}</p>
          <div className="mt-2 flex items-end justify-between gap-2">
            <p className="text-muted-foreground min-w-0 truncate pb-0.5 text-[12px]">
              {deltaCents === null ? t('noPrior') : t('vsPrior', { period: periodLabel })}
            </p>
            {/* Bleeds into the card's corner; the card's overflow-hidden clips it. */}
            <div className="-mr-5 -mb-5 shrink-0">
              <Sparkline values={trend} tone={deltaTone(change, upIsGood)} />
            </div>
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
