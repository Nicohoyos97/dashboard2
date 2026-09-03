// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { MoneyParseError, formatCents, fromCents, sumCents, toCents, variance } from '@/lib/money';

describe('toCents', () => {
  it.each([
    ['1,234.56', 123456],
    ['(1,234.56)', -123456],
    ['-12.5', -1250],
    ['12', 1200],
    ['0.005', 1],
    ['$ 99.99', 9999],
    ['12.50-', -1250],
    ['+7.10', 710],
    ['(-3.00)', 300],
    ['0.00', 0],
    ['-0.00', 0],
  ])('parses %s → %i cents', (input, expected) => {
    expect(toCents(input)).toBe(expected);
  });

  it('accepts numbers and rounds float noise to cents', () => {
    expect(toCents(1234.5)).toBe(123450);
    expect(toCents(0.1 + 0.2)).toBe(30);
    expect(toCents(-1.005)).toBe(-101);
  });

  it.each(['', 'abc', '1.234,56', '12.3.4', '1,23.00', 'NaN', '--5', '(12'])(
    'throws a typed error on %j',
    (input) => {
      expect(() => toCents(input)).toThrow(MoneyParseError);
    },
  );

  it('throws on non-finite numbers', () => {
    expect(() => toCents(Number.POSITIVE_INFINITY)).toThrow(MoneyParseError);
    expect(() => toCents(Number.NaN)).toThrow(MoneyParseError);
  });
});

describe('fromCents', () => {
  it('formats canonical decimal strings', () => {
    expect(fromCents(123456)).toBe('1234.56');
    expect(fromCents(-5)).toBe('-0.05');
    expect(fromCents(0)).toBe('0.00');
    expect(fromCents(toCents('(1,234.56)'))).toBe('-1234.56');
  });

  it('rejects non-integer cents', () => {
    expect(() => fromCents(1.5)).toThrow(MoneyParseError);
  });
});

describe('sumCents', () => {
  it('adds integers exactly', () => {
    expect(sumCents([1, 2, -3, 100])).toBe(100);
    expect(sumCents([])).toBe(0);
  });

  it('rejects fractional input', () => {
    expect(() => sumCents([0.1, 0.2])).toThrow(MoneyParseError);
  });
});

describe('formatCents', () => {
  it('uses Intl currency formatting', () => {
    expect(formatCents(123456)).toBe('$1,234.56');
    expect(formatCents(-5, 'USD')).toBe('-$0.05');
    expect(formatCents(100000, 'EUR', 'de-DE')).toContain('1.000,00');
  });
});

describe('variance', () => {
  it('reports delta and percentage against the magnitude of the prior figure', () => {
    expect(variance(15000, 10000)).toEqual({ deltaCents: 5000, pct: 50 });
    expect(variance(-5000, -10000)).toEqual({ deltaCents: 5000, pct: 50 });
    expect(variance(8000, 10000)).toEqual({ deltaCents: -2000, pct: -20 });
  });

  it('returns pct null when the prior figure is zero', () => {
    expect(variance(5000, 0)).toEqual({ deltaCents: 5000, pct: null });
  });
});
