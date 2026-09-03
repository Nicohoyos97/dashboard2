// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { csvField, spreadsheetText, statementCsv, statementCsvFilename } from '@/lib/reports/csv';
import { buildTree } from '@/lib/reports/tree';

import { line, report, resetPositions } from './fixtures';

describe('statement CSV export', () => {
  it('quotes commas, quotes, newlines and surrounding whitespace per RFC 4180', () => {
    expect(csvField('plain')).toBe('plain');
    expect(csvField('Sales, retail')).toBe('"Sales, retail"');
    expect(csvField('He said "yes"')).toBe('"He said ""yes"""');
    expect(csvField(' leading')).toBe('" leading"');
    expect(csvField('two\nlines')).toBe('"two\nlines"');
    expect(spreadsheetText('=WEBSERVICE("https://example.com")')).toBe('\'=WEBSERVICE("https://example.com")');
    expect(spreadsheetText('Normal account')).toBe('Normal account');
  });

  it('exports every line in tree order, preserves indentation and uses decimal amounts', () => {
    resetPositions();
    const roots = buildTree([
      line('A', 'Income', { isSection: true }),
      line('B', 'Sales, retail', { parent: 'A', depth: 1, current: 123_45, prior: 100_00 }),
      line('C', '=1+1', { parent: 'A', depth: 1, current: 2_00, prior: 1_00 }),
    ]);
    expect(statementCsv(roots)).toBe([
      'Account,Current,Prior,Change,Change %',
      'Income,,,,',
      '"  Sales, retail",123.45,100.00,23.45,23.5',
      '"  \'=1+1",2.00,1.00,1.00,100.0',
    ].join('\r\n'));
    expect(statementCsv(roots, { locale: 'es' }).split('\r\n')[0]).toBe('Cuenta,Actual,Anterior,Cambio,Cambio %');
  });

  it('builds a safe filename from the typed report metadata', () => {
    expect(statementCsvFilename(report())).toBe('profit-and-loss_2026-01-01_2026-06-30.csv');
    expect(statementCsvFilename(report({ reportType: 'balance_sheet' }))).toBe('balance-sheet_2026-01-01_2026-06-30.csv');
  });
});
