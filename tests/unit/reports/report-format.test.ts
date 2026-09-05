// @vitest-environment node
import { describe, expect, it } from 'vitest';

import {
  currencySymbol,
  escapeHtml,
  reportMoney,
  reportNumber,
  reportPercent,
} from '@/lib/reports/report-format';

describe('report formatting (KILL-PDF)', () => {
  it('escapes everything that reaches the markup', () => {
    expect(escapeHtml('Payroll & "Benefits"')).toBe('Payroll &amp; &quot;Benefits&quot;');
    expect(escapeHtml('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(escapeHtml("O'Brien Consulting")).toBe('O&#39;Brien Consulting');
  });

  it('prints detail rows bare and totals with the symbol outside the parentheses', () => {
    expect(reportNumber(39_491_415, 'en')).toBe('394,914.15');
    expect(reportMoney(50_548_213, 'USD', 'en')).toBe('$505,482.13');
    expect(reportMoney(-1_054_231, 'USD', 'en')).toBe('$(10,542.31)');
    expect(reportNumber(-1_054_231, 'en')).toBe('(10,542.31)');
    expect(reportMoney(null, 'USD', 'en')).toBe('');
  });

  it('forces grouping so a money column never mixes 5000,00 with 12.000,00', () => {
    expect(reportNumber(500_000, 'es')).toBe('5.000,00');
    expect(reportNumber(1_200_000, 'es')).toBe('12.000,00');
  });

  it('falls back to the code for a currency Intl does not know', () => {
    expect(currencySymbol('USD', 'en')).toBe('$');
    expect(currencySymbol('not-a-code', 'en')).toBe('not-a-code');
  });

  it('formats a percentage the same way', () => {
    expect(reportPercent(60.24, 'en')).toBe('60.2%');
    expect(reportPercent(-8, 'en')).toBe('(8.0%)');
    expect(reportPercent(null, 'en')).toBe('');
  });
});
