// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { type DeadlineSource, claimKey, dueMilestone, pendingDeadlines } from '@/lib/notifications/deadlines';

const source = (id: string, dueDate: string, kind: DeadlineSource['kind'] = 'reminder.due'): DeadlineSource => ({
  kind,
  id,
  dueDate,
  title: `Obligation ${id}`,
  payload: { dueDate },
  linkPath: '/dashboard#reminders',
});

describe('deadline milestones', () => {
  it('notices a week out and again when the date arrives', () => {
    expect(dueMilestone('2026-09-15', '2026-09-08')).toBe('due_in_7');
    expect(dueMilestone('2026-09-15', '2026-09-14')).toBe('due_in_7');
    expect(dueMilestone('2026-09-15', '2026-09-15')).toBe('due_today');
    expect(dueMilestone('2026-09-15', '2026-09-01')).toBeNull();
  });

  it('still notifies after a missed run rather than skipping the deadline', () => {
    // A job that only matched "exactly 7 days out" would say nothing at all
    // about this one; the dispatch table is what keeps it from repeating.
    expect(dueMilestone('2026-09-15', '2026-09-11')).toBe('due_in_7');
    expect(dueMilestone('2026-09-15', '2026-09-20')).toBe('due_today');
    expect(dueMilestone('not-a-date', '2026-09-20')).toBeNull();
  });

  it('drops the milestones already claimed and keeps the rest', () => {
    const sources = [
      source('a', '2026-09-15'),
      source('b', '2026-09-08'),
      source('c', '2026-12-31'),
      source('d', '2026-09-08', 'tax.deadline'),
    ];
    const claimed = new Set([claimKey('reminder.due', 'b', 'due_today')]);
    expect(pendingDeadlines(sources, '2026-09-08', claimed).map((row) => [row.id, row.milestone])).toEqual([
      ['a', 'due_in_7'],
      ['d', 'due_today'],
    ]);
  });

  it('keys a claim by kind, so a reminder and a tax row sharing an id do not collide', () => {
    expect(claimKey('reminder.due', 'x', 'due_today')).not.toBe(claimKey('tax.deadline', 'x', 'due_today'));
  });
});
