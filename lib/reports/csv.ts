// RFC 4180 export of a statement. Plain decimals (no currency symbols or
// thousands separators) so any spreadsheet parses the numbers; the period and
// report type travel in the filename because CSV has no metadata row.
import { fromCents } from '@/lib/money';

import { flattenTree } from './tree';
import type { LineNode, ReportRow } from './types';

export type CsvHeaders = readonly [string, string, string, string, string];

const EN_HEADERS: CsvHeaders = ['Account', 'Current', 'Prior', 'Change', 'Change %'];
const HEADERS: Record<string, CsvHeaders> = {
  en: EN_HEADERS,
  es: ['Cuenta', 'Actual', 'Anterior', 'Cambio', 'Cambio %'],
};

const INDENT = '  ';
const NEEDS_QUOTES = /[",\r\n]|^\s|\s$/;
const FORMULA_PREFIX = /^[=+\-@\t\r]/;

export function csvField(value: string): string {
  return NEEDS_QUOTES.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Prevent an untrusted account label from becoming a spreadsheet formula. */
export function spreadsheetText(value: string): string {
  return FORMULA_PREFIX.test(value) ? `'${value}` : value;
}

function cents(value: number | null): string {
  return value === null ? '' : fromCents(value);
}

function pct(value: number | null): string {
  return value === null ? '' : (Math.round(value * 10) / 10).toFixed(1);
}

export type StatementCsvOptions = { locale?: string; headers?: CsvHeaders };

/** `Account,Current,Prior,Change,Change %` then one row per line, indented by depth. */
export function statementCsv(roots: readonly LineNode[], { locale = 'en', headers }: StatementCsvOptions = {}): string {
  const header = headers ?? HEADERS[locale.slice(0, 2)] ?? EN_HEADERS;
  const rows = flattenTree(roots).map((line) => [
    `${INDENT.repeat(line.depth)}${spreadsheetText(line.accountName)}`,
    cents(line.currentCents),
    cents(line.priorCents),
    cents(line.deltaCents),
    pct(line.deltaPct),
  ]);
  return [header, ...rows].map((row) => row.map(csvField).join(',')).join('\r\n');
}

export function statementCsvFilename(report: ReportRow): string {
  const type = report.reportType === 'balance_sheet' ? 'balance-sheet' : 'profit-and-loss';
  return `${type}_${report.periodStart}_${report.periodEnd}.csv`;
}

const EN_EXPENSE_HEADERS = ['Date', 'Description', 'Category', 'Vendor', 'Recurring', 'Amount'] as const;
const EXPENSE_HEADERS: Record<string, readonly string[]> = {
  en: EN_EXPENSE_HEADERS,
  es: ['Fecha', 'Descripción', 'Categoría', 'Proveedor', 'Recurrente', 'Monto'],
};

export type ExpenseCsvRow = {
  date: string;
  description: string;
  categoryName: string | null;
  vendor: string | null;
  isRecurring: boolean | null;
  amountCents: number;
};

export type ExpenseCsvOptions = { locale?: string; yes?: string; no?: string; unknown?: string };

/**
 * The filtered expense rows exactly as the table shows them, one per line.
 * Descriptions and vendor names come from an uploaded document, so they go
 * through `spreadsheetText` before anything else can read them as a formula.
 */
export function expensesCsv(rows: readonly ExpenseCsvRow[], { locale = 'en', yes = 'Yes', no = 'No', unknown = '' }: ExpenseCsvOptions = {}): string {
  const header = EXPENSE_HEADERS[locale.slice(0, 2)] ?? EN_EXPENSE_HEADERS;
  const body = rows.map((row) => [
    row.date,
    spreadsheetText(row.description),
    spreadsheetText(row.categoryName ?? ''),
    spreadsheetText(row.vendor ?? ''),
    row.isRecurring === null ? unknown : row.isRecurring ? yes : no,
    fromCents(row.amountCents),
  ]);
  return [header, ...body].map((row) => row.map(csvField).join(',')).join('\r\n');
}

export function expensesCsvFilename(range: { start: string; end: string }): string {
  return `expenses_${range.start}_${range.end}.csv`;
}
