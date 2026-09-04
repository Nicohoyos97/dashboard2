// Effective reminder status (spec §7): the firm records intent (`upcoming`,
// `paid`, `completed`, `needs_confirmation`); the time-based states are
// derived from the due date at read time so nothing goes stale in the DB.
export type ReminderStatus =
  | 'upcoming'
  | 'due_soon'
  | 'due_today'
  | 'paid'
  | 'completed'
  | 'overdue'
  | 'needs_confirmation';

export const DUE_SOON_DAYS = 7;

const DAY_MS = 86_400_000;

export function effectiveReminderStatus(
  stored: string,
  dueDate: string,
  today: string,
): ReminderStatus {
  if (stored === 'paid' || stored === 'completed' || stored === 'needs_confirmation') return stored;
  const days = Math.round((Date.parse(dueDate) - Date.parse(today)) / DAY_MS);
  if (days < 0) return 'overdue';
  if (days === 0) return 'due_today';
  if (days <= DUE_SOON_DAYS) return 'due_soon';
  return 'upcoming';
}

/**
 * The server's own calendar date. Only for contexts with no business in hand
 * (the firm dashboard, which spans clients in several zones). Anything scoped
 * to one business must use `todayIn(settings.timezone)` — see lib/utils/timezone.ts.
 */
export function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}
