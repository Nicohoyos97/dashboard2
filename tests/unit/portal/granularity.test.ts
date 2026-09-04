// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { granularityChoices } from '@/lib/portal/granularity';
import { availablePeriods } from '@/lib/reports/periods';

import { report } from '../reports/fixtures';

const monthly = [
  report({ id: 'm1', periodStart: '2026-01-01', periodEnd: '2026-01-31' }),
  report({ id: 'm2', periodStart: '2026-02-01', periodEnd: '2026-02-28' }),
];

describe('granularity choices', () => {
  it('points each supported granularity at its newest published period', () => {
    const periods = availablePeriods([...monthly, report({ id: 'y1', periodStart: '2025-01-01', periodEnd: '2025-12-31' })], []);
    const choices = granularityChoices(periods, { start: '2026-02-01', end: '2026-02-28' });
    expect(choices).toEqual([
      { kind: 'month', enabled: true, reason: null, value: '2026-02-01_2026-02-28', selected: true },
      { kind: 'quarter', enabled: false, reason: 'no_quarterly_source', value: null, selected: false },
      { kind: 'year', enabled: true, reason: null, value: '2025-01-01_2025-12-31', selected: false },
    ]);
  });

  it('disables a granularity no source covers rather than slicing a longer report', () => {
    // A single half-year statement supports none of the three: it is neither a
    // month, a quarter nor a year, and months must not be derived from it.
    const periods = availablePeriods([report({ id: 'h1', periodStart: '2026-01-01', periodEnd: '2026-06-30' })], []);
    const choices = granularityChoices(periods, { start: '2026-01-01', end: '2026-06-30' });
    expect(choices.every((choice) => !choice.enabled && choice.value === null && !choice.selected)).toBe(true);
    expect(choices.map((choice) => choice.reason)).toEqual(['no_monthly_source', 'no_quarterly_source', 'no_annual_source']);
  });
});
