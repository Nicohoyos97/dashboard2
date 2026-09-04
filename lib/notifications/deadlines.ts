// Which obligations deserve a notification today, and how many days out
// (INITIAL_PROMPT.md §7: "Reminders and due dates", "Tax deadlines"). Pure and
// date-only: the job supplies each business's own `today` (todayIn(timezone)),
// so a Florida client is never told at 8 pm that a deadline "is today" because
// the server is already on tomorrow's UTC date.
import { daysBetween } from '@/lib/reports/dates';

export type DeadlineMilestone = 'due_in_7' | 'due_today';

/** Kinds that a milestone can be claimed for; both are `notify.ts` kinds. */
export type DeadlineKind = 'reminder.due' | 'tax.deadline';

export type DeadlineSource = {
  kind: DeadlineKind;
  id: string;
  dueDate: string;
  /** Fallback title stored on the row; the bell prefers the localized wording. */
  title: string;
  payload: Record<string, string | number>;
  linkPath: string;
};

export type PendingDeadline = DeadlineSource & { milestone: DeadlineMilestone };

/** Days ahead at which the first notice goes out. */
export const NOTICE_DAYS = 7;

/**
 * A range rather than an exact day: a job that misses a run (a deploy, an
 * outage) would otherwise skip the milestone entirely. Sending late is
 * recoverable; never sending is not, and `notification_dispatches` is what
 * stops the range from notifying twice.
 */
export function dueMilestone(dueDate: string, today: string): DeadlineMilestone | null {
  const days = daysBetween(today, dueDate);
  if (days === null) return null;
  if (days <= 0) return 'due_today';
  if (days <= NOTICE_DAYS) return 'due_in_7';
  return null;
}

/** The milestones owed today, minus the ones already claimed (`kind:id:milestone`). */
export function pendingDeadlines(
  sources: readonly DeadlineSource[],
  today: string,
  claimed: ReadonlySet<string>,
): PendingDeadline[] {
  const pending: PendingDeadline[] = [];
  for (const source of sources) {
    const milestone = dueMilestone(source.dueDate, today);
    if (!milestone) continue;
    if (claimed.has(claimKey(source.kind, source.id, milestone))) continue;
    pending.push({ ...source, milestone });
  }
  return pending;
}

export function claimKey(kind: DeadlineKind, id: string, milestone: DeadlineMilestone): string {
  return `${kind}:${id}:${milestone}`;
}
