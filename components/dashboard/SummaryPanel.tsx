import { CalendarClock } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

import type { StatCardItem, StatTone } from './StatCards';

const BADGE: Record<StatTone, string> = {
  positive: 'bg-success/10 text-success',
  negative: 'bg-danger/10 text-danger',
  warning: 'bg-warning/10 text-warning',
  neutral: 'bg-secondary text-muted-foreground',
};

/**
 * A tax page's answer to "what do I owe, and when?", as one panel: the amount
 * still owed leads, the next due date rides beside it, and the figures that
 * explain it — estimated, confirmed, paid, collected, filed — sit in a quiet
 * grid. It replaces a wall of five or six cards of equal weight, where the one
 * number the owner came for was the fourth box of six.
 *
 * Every value keeps the StatCards contract: null renders `unavailable`, never a
 * zero standing in for "unknown".
 */
export async function SummaryPanel({
  focal,
  due,
  items,
}: {
  focal: StatCardItem;
  /** The next due date, already formatted, with its label. */
  due: { label: string; value: string | null; unavailable: string };
  items: readonly StatCardItem[];
}) {
  const t = await getTranslations('Overview');
  const cols = items.length === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2';

  return (
    <section className="border-line bg-card grid overflow-hidden rounded-2xl border shadow-card lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <div className="flex flex-col p-5 sm:p-6">
        <p className="text-muted-foreground text-small font-medium">{focal.label}</p>
        {focal.value === null ? (
          <p className="text-muted-foreground mt-2 text-ui">{focal.unavailable ?? t('noDataPeriod')}</p>
        ) : (
          <p className="text-ink mt-1 text-display leading-tight font-bold tracking-[-0.02em] tabular-nums">{focal.value}</p>
        )}
        {focal.detail && <p className="text-muted-foreground mt-1 text-small">{focal.detail}</p>}
        <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
          {focal.badge && focal.value !== null && (
            <span className={`rounded-full px-2.5 py-1 text-caption font-semibold ${BADGE[focal.badge.tone]}`}>{focal.badge.text}</span>
          )}
          <span className="border-line text-ink inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-caption font-medium">
            <CalendarClock className="text-link size-3.5" aria-hidden="true" />
            <span className="text-muted-foreground">{due.label}</span>
            <span className="tabular-nums">{due.value ?? due.unavailable}</span>
          </span>
        </div>
      </div>

      {/* Hairlines from the gap: the cells sit on the border colour, so every
          divider is exactly one pixel whichever way the grid wraps. */}
      <dl className={`bg-line border-line grid grid-cols-2 gap-px border-t lg:border-t-0 lg:border-l ${cols} [&>*:last-child:nth-child(odd)]:col-span-2 sm:[&>*:last-child:nth-child(odd)]:col-span-1`}>
        {items.map((item) => (
          <div key={item.label} className="bg-card flex min-w-0 flex-col p-4 sm:p-5">
            <dt className="text-muted-foreground text-small font-medium">{item.label}</dt>
            <dd className="mt-1 min-w-0">
              {item.value === null ? (
                <span className="text-muted-foreground block text-small leading-snug">{item.unavailable ?? t('noDataPeriod')}</span>
              ) : (
                <span className="text-ink block truncate text-heading font-semibold tabular-nums">{item.value}</span>
              )}
              {item.detail && <span className="text-muted-foreground mt-0.5 block truncate text-caption">{item.detail}</span>}
              {item.badge && item.value !== null && (
                <span className={`mt-2 inline-flex rounded-full px-2 py-0.5 text-micro font-semibold ${BADGE[item.badge.tone]}`}>{item.badge.text}</span>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
