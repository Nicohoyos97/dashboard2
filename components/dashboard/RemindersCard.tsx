import { CalendarClock } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';

import type { ReminderRow } from '@/lib/portal/load';
import { effectiveReminderStatus } from '@/lib/reminders/status';
import { formatIsoDate } from '@/lib/utils/dates';
import { formatCents } from '@/lib/money';

const TONE: Record<string, string> = {
  overdue: 'bg-danger/10 text-danger',
  due_today: 'bg-danger/10 text-danger',
  due_soon: 'bg-warning/10 text-warning',
  needs_confirmation: 'bg-warning/10 text-warning',
  paid: 'bg-success/10 text-success',
  completed: 'bg-success/10 text-success',
  upcoming: 'bg-secondary text-muted-foreground',
};

// Reminders and obligations with status (INITIAL_PROMPT.md §7): the time-based
// states are derived at read time; status is never conveyed by color alone.
// `today` comes from the page in the business's own time zone (migration
// 0010): read from the server clock, a reminder due today read "Due today"
// hours early for anyone west of UTC.
export async function RemindersCard({ reminders, currency, today, limit = 6 }: { reminders: ReminderRow[]; currency: string; today: string; limit?: number }) {
  const [t, locale] = await Promise.all([getTranslations('Reminders'), getLocale()]);

  const money = (c: number) => formatCents(c, currency);
  const open = reminders
    .map((r) => ({ ...r, effective: effectiveReminderStatus(r.status, r.dueDate, today) }))
    .filter((r) => r.effective !== 'paid' && r.effective !== 'completed')
    .slice(0, limit);

  return (
    <section className="border-line bg-card flex flex-col rounded-2xl border p-5 shadow-card">
      <h2 className="text-ink flex items-center gap-2 text-title font-semibold">
        <CalendarClock className="text-link size-[18px]" aria-hidden="true" />
        {t('title')}
      </h2>
      {open.length === 0 ? (
        <p className="text-muted-foreground mt-3 text-ui">{t('empty')}</p>
      ) : (
        <ul className="divide-line mt-3 divide-y">
          {open.map((r) => (
            <li key={r.id} className="flex items-start gap-3 py-3.5 text-ui first:pt-1 last:pb-0">
              <span className="min-w-0 flex-1">
                <span className="text-ink block font-semibold text-pretty">{r.title}</span>
                <span className="text-muted-foreground mt-0.5 block text-small">
                  {t(`reminderType_${r.reminderType}`)} · {t('due')} {formatIsoDate(r.dueDate, locale)}
                  {r.amountCents !== null ? <> · <span className="tabular-nums">{money(r.amountCents)}</span></> : null}
                  {' · '}
                  {r.responsible === 'firm' ? t('responsibleFirm') : t('responsibleClient')}
                </span>
                {r.actionRequired && <span className="text-ink mt-1 block text-small">{r.actionRequired}</span>}
              </span>
              <span className={`shrink-0 rounded-full px-2.5 py-1 text-caption font-semibold whitespace-nowrap ${TONE[r.effective] ?? TONE.upcoming}`}>
                {t(`reminderStatus_${r.effective}`)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
