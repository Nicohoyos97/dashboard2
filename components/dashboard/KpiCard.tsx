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

  const pill =
    cents !== null && change !== null && magnitude !== null ? (
      <DeltaPill change={change} magnitude={magnitude} upIsGood={upIsGood} />
    ) : null;

  // Label on top, everything else anchored to the foot: the cards of a row
  // share a height, so their figures line up even when one label wraps — as
  // "Operating expenses" does two to a row on a phone. The change sits under
  // the figure with the period it was measured against, and the trend bleeds
  // into the corner from `sm` up.
  return (
    <article className="group border-line bg-card focus-within:border-brand/40 hover:border-brand/30 relative flex flex-col overflow-hidden rounded-2xl border p-4 shadow-card transition-[border-color,box-shadow] hover:shadow-card-hover sm:p-5">
      <p className="text-muted-foreground relative z-10 flex items-start gap-0.5 text-small leading-snug font-medium sm:gap-1">
        <span className="min-w-0 pt-0.5">{label}</span>
        <InfoTip text={how} label={t('howCalculated')} />
      </p>
      {cents === null ? (
        <p className="text-muted-foreground mt-3 text-small leading-snug">{unavailableReason ?? t('noDataPeriod')}</p>
      ) : (
        <div className="mt-auto pt-1">
          <p className="text-ink text-stat leading-tight font-bold tracking-[-0.02em] tabular-nums sm:text-display">{money(cents)}</p>
          <div className="mt-2 flex items-end justify-between gap-2">
            <div className="min-w-0">
              {pill && <span className="mb-1.5 flex">{pill}</span>}
              <p className="text-muted-foreground min-w-0 truncate text-caption">
                {deltaCents === null ? t('noPrior') : t('vsPrior', { period: periodLabel })}
              </p>
            </div>
            {/* Bleeds into the card's corner; the card's overflow-hidden clips it. */}
            <div className="-mr-5 -mb-5 shrink-0 max-sm:hidden">
              <Sparkline values={trend} tone={deltaTone(change, upIsGood)} />
            </div>
            {/* The sparkline is aria-hidden; this is its text equivalent (§1: every chart ships one). */}
            {trend.length >= 2 && (
              <span className="sr-only">
                {t('trendSummary', { count: trend.length, first: money(trend[0] ?? 0), last: money(trend[trend.length - 1] ?? 0) })}
              </span>
            )}
          </div>
        </div>
      )}
      <Link href={href} className="focus-visible:ring-brand/40 absolute inset-0 rounded-2xl outline-none focus-visible:ring-3">
        <span className="sr-only">{t('viewDetail')}</span>
      </Link>
    </article>
  );
}
