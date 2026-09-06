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
    expect(reportNumber(39_491_415)).toBe('394,914.15');
    expect(reportMoney(50_548_213, 'USD')).toBe('$505,482.13');
    expect(reportMoney(-1_054_231, 'USD')).toBe('$(10,542.31)');
    expect(reportNumber(-1_054_231)).toBe('(10,542.31)');
    expect(reportMoney(null, 'USD')).toBe('');
  });

  it('writes money the American way, whatever language the letter is in', () => {
    // A US accounting document. Grouping is still forced — Spanish leaves
    // four-digit numbers ungrouped by default, which would put 5000.00 beside
    // 12,000.00 in one column — but the separators no longer follow the
    // reader's language, so a client can compare the report to their bank
    // statement without re-reading every figure. See MONEY_LOCALE.
    expect(reportNumber(500_000)).toBe('5,000.00');
    expect(reportNumber(1_200_000)).toBe('12,000.00');
    expect(reportMoney(120_000, 'USD')).toBe('$1,200.00');
    expect(reportMoney(120_000, 'USD')).not.toContain('US$');
  });

  it('falls back to the code for a currency Intl does not know', () => {
    expect(currencySymbol('USD')).toBe('$');
    expect(currencySymbol('not-a-code')).toBe('not-a-code');
  });

  it('formats a percentage the same way', () => {
    expect(reportPercent(60.24)).toBe('60.2%');
    expect(reportPercent(-8)).toBe('(8.0%)');
    expect(reportPercent(null)).toBe('');
  });
});
