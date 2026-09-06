// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { compactMoney, moneyAxisWidth } from '@/components/charts/format';

// The axis was a fixed width={64}, tuned for "$60K", and Spanish spelled the
// same amount "60 mil US$" — clipped against the chart edge, so "15 mil US$"
// rendered without its 1. Money is now written the American way in every
// language (MONEY_LOCALE), which removes that particular gap; the width is
// still measured, because magnitude and currency still change it.
describe('moneyAxisWidth', () => {
  const series = [1_500_00, 60_000_00, 42_802_65];

  it('writes money the same way in every language', () => {
    expect(compactMoney(60_000_00, 'USD')).toBe('$60K');
    expect(compactMoney(60_000_00, 'USD')).not.toContain('mil');
  });

  it('fits the widest tick the axis will draw', () => {
    // The top tick sits on a round number above the data, so the peak itself
    // is not the widest label.
    const width = moneyAxisWidth(series, 'USD');
    for (const value of [0, 60_000_00, 60_000_00 * 1.3]) {
      expect(width, compactMoney(value, 'USD')).toBeGreaterThanOrEqual(
        compactMoney(value, 'USD').length * 6.6,
      );
    }
  });

  it('grows for a magnitude that needs more room', () => {
    const millions = moneyAxisWidth([9_999_999_00], 'USD');
    expect(millions).toBeGreaterThanOrEqual(moneyAxisWidth(series, 'USD'));
  });

  it('survives an empty or all-null series', () => {
    expect(moneyAxisWidth([], 'USD')).toBeGreaterThanOrEqual(64);
    expect(moneyAxisWidth([null, null], 'USD')).toBe(64);
  });

  it('never eats the plot: a huge number is capped', () => {
    expect(moneyAxisWidth([9_999_999_999_00], 'USD')).toBeLessThanOrEqual(120);
  });
});
