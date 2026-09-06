// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { formatPeriod, formatPeriodCompact } from '@/lib/utils/dates';

// The Net sales chart labels its axis with this. The full form is wide enough
// that Recharts drew only the first and last tick, leaving six months of sales
// with two dates on the axis — so a whole month collapses to "Aug 2026" and
// everything else keeps the days, which are then the information.
describe('formatPeriodCompact', () => {
  it('writes a whole calendar month as the month', () => {
    expect(formatPeriodCompact('2026-08-01', '2026-08-31', 'en')).toBe('Aug 2026');
    expect(formatPeriodCompact('2026-04-01', '2026-04-30', 'en')).toBe('Apr 2026');
    // February, and February in a leap year — the two the day count is wrong
    // about if it is assumed rather than computed.
    expect(formatPeriodCompact('2026-02-01', '2026-02-28', 'en')).toBe('Feb 2026');
    expect(formatPeriodCompact('2028-02-01', '2028-02-29', 'en')).toBe('Feb 2028');
  });

  it('follows the reader for the month name', () => {
    expect(formatPeriodCompact('2026-08-01', '2026-08-31', 'es')).toMatch(/2026/);
    expect(formatPeriodCompact('2026-08-01', '2026-08-31', 'es')).not.toContain('–');
  });

  it('keeps the full form for anything that is not a whole month', () => {
    const quarter = formatPeriodCompact('2026-07-01', '2026-09-30', 'en');
    expect(quarter).toBe(formatPeriod('2026-07-01', '2026-09-30', 'en'));
    // A month short of its last day is a partial period, not a month.
    expect(formatPeriodCompact('2026-08-01', '2026-08-30', 'en')).toContain('–');
    expect(formatPeriodCompact('2026-08-02', '2026-08-31', 'en')).toContain('–');
    expect(formatPeriodCompact('2028-02-01', '2028-02-28', 'en')).toContain('–');
  });

  it('is empty when there is no period', () => {
    expect(formatPeriodCompact(null, '2026-08-31', 'en')).toBe('');
    expect(formatPeriodCompact('2026-08-01', undefined, 'en')).toBe('');
  });
});
