// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { presetOf, presetRange, rangeIsPublished } from '@/lib/reports/presets';

// A Tuesday in the middle of Q3, so no preset lands on a boundary by accident.
const TODAY = '2026-08-18';

describe('presetRange', () => {
  it('resolves the month presets', () => {
    expect(presetRange('this_month', TODAY)).toEqual({ start: '2026-08-01', end: '2026-08-31' });
    expect(presetRange('last_month', TODAY)).toEqual({ start: '2026-07-01', end: '2026-07-31' });
  });

  it('resolves the quarter presets to whole calendar quarters', () => {
    expect(presetRange('this_quarter', TODAY)).toEqual({ start: '2026-07-01', end: '2026-09-30' });
    expect(presetRange('last_quarter', TODAY)).toEqual({ start: '2026-04-01', end: '2026-06-30' });
  });

  it('resolves the year presets', () => {
    expect(presetRange('this_year', TODAY)).toEqual({ start: '2026-01-01', end: '2026-12-31' });
    expect(presetRange('last_year', TODAY)).toEqual({ start: '2025-01-01', end: '2025-12-31' });
  });

  it('crosses a year boundary rather than clamping inside it', () => {
    expect(presetRange('last_month', '2026-01-09')).toEqual({ start: '2025-12-01', end: '2025-12-31' });
    expect(presetRange('last_quarter', '2026-02-09')).toEqual({ start: '2025-10-01', end: '2025-12-31' });
  });

  it('gets February right in a leap year and out of one', () => {
    expect(presetRange('this_month', '2028-02-10')).toEqual({ start: '2028-02-01', end: '2028-02-29' });
    expect(presetRange('this_month', '2026-02-10')).toEqual({ start: '2026-02-01', end: '2026-02-28' });
  });

  it('holds on the first and last day of a quarter', () => {
    expect(presetRange('this_quarter', '2026-07-01')).toEqual({ start: '2026-07-01', end: '2026-09-30' });
    expect(presetRange('this_quarter', '2026-09-30')).toEqual({ start: '2026-07-01', end: '2026-09-30' });
  });

  it('returns null for an unreadable date rather than a guessed range', () => {
    expect(presetRange('this_month', 'not-a-date')).toBeNull();
  });
});

describe('presetOf', () => {
  it('names the preset a range matches', () => {
    expect(presetOf({ start: '2026-08-01', end: '2026-08-31' }, TODAY)).toBe('this_month');
    expect(presetOf({ start: '2026-04-01', end: '2026-06-30' }, TODAY)).toBe('last_quarter');
  });

  it('is null for a range that is nobody’s preset — that is a custom range', () => {
    expect(presetOf({ start: '2026-08-05', end: '2026-09-04' }, TODAY)).toBeNull();
  });
});

describe('rangeIsPublished', () => {
  // A preset is a calendar question; whether the firm published a statement
  // covering it is a different one, and the portal must never answer the
  // second by estimating from a longer period.
  const published = [
    { start: '2026-07-01', end: '2026-07-31' },
    { start: '2026-08-01', end: '2026-08-31' },
  ];

  it('is true only for an exact match', () => {
    expect(rangeIsPublished({ start: '2026-08-01', end: '2026-08-31' }, published)).toBe(true);
    expect(rangeIsPublished({ start: '2026-07-01', end: '2026-09-30' }, published)).toBe(false);
  });

  it('does not treat a covering period as covering the range inside it', () => {
    const annual = [{ start: '2026-01-01', end: '2026-12-31' }];
    expect(rangeIsPublished({ start: '2026-08-01', end: '2026-08-31' }, annual)).toBe(false);
  });
});
