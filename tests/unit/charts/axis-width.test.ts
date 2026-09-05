// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { compactMoney, moneyAxisWidth } from '@/components/charts/format';

// The Spanish portal drew "60 mil US$" into a 64px axis and the label was cut
// against the chart edge — "15 mil US$" lost its 1, which reads as a different
// number. The width now comes from the strings the axis will actually draw.
describe('moneyAxisWidth', () => {
  const series = [1_500_00, 60_000_00, 42_802_65];

  it('gives a Spanish axis more room than an English one for the same money', () => {
    expect(compactMoney(60_000_00, 'USD', 'en')).toBe('$60K');
    expect(compactMoney(60_000_00, 'USD', 'es')).toContain('mil');
    expect(moneyAxisWidth(series, 'USD', 'es')).toBeGreaterThan(
      moneyAxisWidth(series, 'USD', 'en'),
    );
  });

  it('fits the widest tick the axis will draw', () => {
    // The top tick sits on a round number above the data, so the peak itself is
    // not the widest label.
    const width = moneyAxisWidth(series, 'USD', 'es');
    for (const value of [0, 60_000_00, 60_000_00 * 1.3]) {
      expect(width, compactMoney(value, 'USD', 'es')).toBeGreaterThanOrEqual(
        compactMoney(value, 'USD', 'es').length * 6.6,
      );
    }
  });

  it('leaves the English axis at the width it already had', () => {
    expect(moneyAxisWidth(series, 'USD', 'en')).toBe(64);
  });

  it('survives an empty or all-null series', () => {
    expect(moneyAxisWidth([], 'USD', 'es')).toBeGreaterThanOrEqual(64);
    expect(moneyAxisWidth([null, null], 'USD', 'en')).toBe(64);
  });

  it('never eats the plot: a huge number is capped', () => {
    expect(moneyAxisWidth([9_999_999_999_00], 'USD', 'es')).toBeLessThanOrEqual(120);
  });
});
