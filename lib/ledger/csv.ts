// One P&L account's transactions as a CSV the client can open in a
// spreadsheet: plain decimals with the export's own sign, ISO dates, and every
// text field from the ledger guarded against becoming a formula — names and
// bank descriptions are the file's, not ours (CLAUDE.md §2.8).
import { fromCents } from '@/lib/money';
import { csvField, spreadsheetText } from '@/lib/reports/csv';
import type { ReportRow } from '@/lib/reports/types';

import type { LedgerTxn } from './display';

const HEADERS: Record<string, readonly string[]> = {
  en: ['Account', 'Date', 'Name', 'Description', 'Type', 'Num', 'Other account', 'Amount'],
  es: ['Cuenta', 'Fecha', 'Nombre', 'Descripción', 'Tipo', 'Número', 'Otra cuenta', 'Monto'],
};

const text = (value: string | null): string => (value === null ? '' : spreadsheetText(value));

export function ledgerCsv(account: string, txns: readonly LedgerTxn[], locale: string): string {
  const header = HEADERS[locale.slice(0, 2)] ?? HEADERS.en ?? [];
  const rows = txns.map((tx) => [
    spreadsheetText(account),
    tx.date,
    text(tx.name),
    text(tx.description),
    text(tx.type),
    text(tx.num),
    text(tx.split),
    fromCents(tx.amountCents),
  ]);
  return [header, ...rows].map((row) => row.map(csvField).join(',')).join('\r\n');
}

/** `coffee-food-sales_2026-09-01_2026-09-30.csv` — ASCII only, so no browser mangles it. */
export function ledgerCsvFilename(account: string, report: Pick<ReportRow, 'periodStart' | 'periodEnd'>): string {
  const slug = account
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `${slug || 'account'}_${report.periodStart}_${report.periodEnd}.csv`;
}
