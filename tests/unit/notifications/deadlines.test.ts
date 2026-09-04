// @vitest-environment node
import { describe, expect, it } from 'vitest';

import {
  type DeadlineSource,
  OVERDUE_GRACE_DAYS,
  claimKey,
  dueMilestone,
  pendingDeadlines,
} from '@/lib/notifications/deadlines';

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

describe('how far into the past a deadline still notifies', () => {
  it('recovers a run missed for up to the grace window', () => {
    // The range exists so a deploy or an outage does not swallow a milestone.
    expect(dueMilestone('2026-09-15', '2026-09-18')).toBe('due_today');
    expect(dueMilestone('2026-09-15', '2026-09-22')).toBe('due_today');
  });

  it('says nothing about a deadline long past', () => {
    // notification_dispatches was created empty, so without a floor the first
    // run after deploy announces every overdue row ever published as "due
    // today" — a client waking up to a year of 2024 dates.
    expect(dueMilestone('2024-03-20', '2026-09-05')).toBeNull();
    expect(dueMilestone('2026-09-15', '2026-09-23')).toBeNull();
  });

  it('exposes the floor the job uses to bound its query', () => {
    expect(OVERDUE_GRACE_DAYS).toBe(7);
  });
});
