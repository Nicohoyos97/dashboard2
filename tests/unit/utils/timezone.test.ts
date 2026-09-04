// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { DEFAULT_TIMEZONE, isValidTimeZone, todayIn } from '@/lib/utils/timezone';

describe('business time zone', () => {
  it('resolves the calendar date in the business zone, not the server clock', () => {
    // 2026-09-05 01:30 UTC is still 2026-09-04 in New York and already
    // 2026-09-05 in Madrid. Reading the server clock made the Florida client
    // "one day late" from about 8 pm local.
    const instant = new Date('2026-09-05T01:30:00Z');
    expect(todayIn('America/New_York', instant)).toBe('2026-09-04');
    expect(todayIn('Europe/Madrid', instant)).toBe('2026-09-05');
    expect(todayIn('UTC', instant)).toBe('2026-09-05');
  });

  it('crosses the date at the zone boundary, not at 00:00 UTC', () => {
    const beforeMidnight = new Date('2026-09-05T03:59:00Z'); // 23:59 in New York
    const afterMidnight = new Date('2026-09-05T04:01:00Z'); // 00:01 in New York
    expect(todayIn('America/New_York', beforeMidnight)).toBe('2026-09-04');
    expect(todayIn('America/New_York', afterMidnight)).toBe('2026-09-05');
  });

  it('falls back to UTC rather than throwing when the stored name is unusable', () => {
    const instant = new Date('2026-09-05T01:30:00Z');
    expect(todayIn('Not/AZone', instant)).toBe('2026-09-05');
    expect(isValidTimeZone('Not/AZone')).toBe(false);
    expect(isValidTimeZone('America/Bogota')).toBe(true);
    expect(isValidTimeZone('')).toBe(false);
    expect(isValidTimeZone(DEFAULT_TIMEZONE)).toBe(true);
  });
});
