// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { DUE_SOON_DAYS, effectiveReminderStatus } from '@/lib/reminders/status';

describe('effective reminder status', () => {
  it('derives overdue, due-today, due-soon and upcoming from the date', () => {
    expect(effectiveReminderStatus('upcoming', '2026-06-09', '2026-06-10')).toBe('overdue');
    expect(effectiveReminderStatus('upcoming', '2026-06-10', '2026-06-10')).toBe('due_today');
    expect(effectiveReminderStatus('upcoming', '2026-06-17', '2026-06-10')).toBe('due_soon');
    expect(effectiveReminderStatus('upcoming', '2026-06-18', '2026-06-10')).toBe('upcoming');
    expect(DUE_SOON_DAYS).toBe(7);
  });

  it('preserves terminal and needs-confirmation states regardless of date', () => {
    expect(effectiveReminderStatus('paid', '2020-01-01', '2026-06-10')).toBe('paid');
    expect(effectiveReminderStatus('completed', '2020-01-01', '2026-06-10')).toBe('completed');
    expect(effectiveReminderStatus('needs_confirmation', '2020-01-01', '2026-06-10')).toBe('needs_confirmation');
  });
});
