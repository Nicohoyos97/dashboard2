// A QuickBooks Online "General Ledger" CSV export, read deterministically —
// no model: the layout is the report's own and every figure is checked against
// the totals the file prints (reconcile.ts).
//
// The layout, as QuickBooks writes it:
//
//   Company name
//   General Ledger (…)
//   September 2026                         ← the period
//   (blank)
//   ,Distribution account,Transaction date,Transaction type,Num,Name,Description,Split,Amount,Balance
//   6300 - Utilities                       ← an account opens: its name in column A
//   63001 - Electricity                    ← a sub-account opens inside it
//   ,63001 - Electricity,09/22/2026,Expense,,,COMED PAYMENT,Checking,300.00,300.00
//   Total for 63001 - Electricity,,,,,,,,$300.00,
//   Total for 6300 - Utilities with sub-accounts,,,,,,,,$300.00,
//   …
//   Accrual Basis Sunday, October 18, 2026 11:47 PM GMT-05:00    ← the basis
//
// Errors carry identifiers only (a row number, a column name), never content.
import Papa from 'papaparse';

import { IngestionError } from '@/lib/ingestion/errors';
import { MoneyParseError, toCents } from '@/lib/money';

import { type LedgerPeriod, parseLedgerPeriod } from './period';

export type LedgerAccount = {
  name: string;
  /** Index into `accounts` of the account this one sits under. */
  parentIndex: number | null;
  depth: number;
  /** The export's own "Total for …" figure — for a parent, the "with sub-accounts" one. */
  printedTotalCents: number | null;
};

export type LedgerTransaction = {
  accountIndex: number;
  date: string;
  type: string | null;
  num: string | null;
  name: string | null;
  description: string | null;
  split: string | null;
  amountCents: number;
};

export type ParsedLedger = {
  company: string | null;
  periodLabel: string | null;
  period: LedgerPeriod | null;
  basis: 'cash' | 'accrual' | null;
  accounts: LedgerAccount[];
  transactions: LedgerTransaction[];
};

type Columns = {
  account: number | null;
  date: number;
  type: number | null;
  num: number | null;
  name: number | null;
  description: number | null;
  split: number | null;
  amount: number;
};

const HEADERS: Record<keyof Columns, readonly string[]> = {
  account: ['distribution account', 'account', 'account name'],
  date: ['transaction date', 'date'],
  type: ['transaction type', 'type'],
  num: ['num', 'no.', 'number'],
  name: ['name'],
  description: ['description', 'memo/description', 'memo'],
  split: ['split', 'split account'],
  amount: ['amount'],
};

const TOTAL = /^Total for (.+?)( with sub-accounts)?$/i;
const FOOTER = /^(cash|accrual) basis\b/i;
const US_DATE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;

function fail(detail: string): never {
  throw new IngestionError('ledger_unrecognized', detail);
}

function columns(header: readonly string[]): Columns | null {
  const cells = header.map((cell) => cell.trim().toLowerCase());
  const find = (key: keyof Columns): number | null => {
    const index = cells.findIndex((cell) => HEADERS[key].includes(cell));
    return index === -1 ? null : index;
  };
  const date = find('date');
  const amount = find('amount');
  if (date === null || amount === null) return null;
  return {
    account: find('account'),
    date,
    type: find('type'),
    num: find('num'),
    name: find('name'),
    description: find('description'),
    split: find('split'),
    amount,
  };
}

function isoDate(text: string, row: number): string {
  const m = US_DATE.exec(text.trim());
  if (!m) fail(`row ${row}: date`);
  const [month, day, year] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) fail(`row ${row}: date`);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function cents(text: string, row: number): number {
  try {
    // QuickBooks prints a negative total as "-$6,315.64", the sign before the symbol.
    return toCents(text.replace('$', ''));
  } catch (error) {
    if (error instanceof MoneyParseError) fail(`row ${row}: amount`);
    throw error;
  }
}

export function parseGeneralLedger(text: string): ParsedLedger {
  const parsed = Papa.parse<string[]>(text.replace(/^﻿/, ''), { skipEmptyLines: false });
  const rows = parsed.data.map((row) => row.map((cell) => (cell ?? '').trim()));
  const cell = (row: readonly string[], index: number | null): string | null => {
    if (index === null) return null;
    const value = row[index] ?? '';
    return value === '' ? null : value;
  };

  const headerIndex = rows.findIndex((row) => columns(row) !== null);
  const header = rows[headerIndex];
  const cols = header ? columns(header) : null;
  if (headerIndex === -1 || !cols) fail('header');

  const titles = rows.slice(0, headerIndex).map((row) => row[0] ?? '').filter((value) => value !== '');
  if (!titles.some((title) => /general ledger/i.test(title))) fail('title');
  const titleIndex = titles.findIndex((title) => /general ledger/i.test(title));
  const company = titleIndex > 0 ? (titles[titleIndex - 1] ?? null) : null;
  const periodLabel = titles[titleIndex + 1] ?? null;

  const accounts: LedgerAccount[] = [];
  const transactions: LedgerTransaction[] = [];
  const open: number[] = [];
  let basis: ParsedLedger['basis'] = null;

  for (let i = headerIndex + 1; i < rows.length; i += 1) {
    const row = rows[i] ?? [];
    const rowNumber = i + 1;
    if (row.every((value) => value === '')) continue;
    const first = row[0] ?? '';

    if (first !== '') {
      const footer = FOOTER.exec(first);
      if (footer) {
        basis = footer[1]?.toLowerCase() === 'cash' ? 'cash' : 'accrual';
        continue;
      }
      const total = TOTAL.exec(first);
      if (total) {
        const top = open.pop();
        const account = top === undefined ? undefined : accounts[top];
        if (!account || account.name !== total[1]) fail(`row ${rowNumber}: total`);
        const amount = cell(row, cols.amount);
        account.printedTotalCents = amount === null ? 0 : cents(amount, rowNumber);
        continue;
      }
      const parent = open.at(-1) ?? null;
      accounts.push({ name: first, parentIndex: parent, depth: open.length, printedTotalCents: null });
      open.push(accounts.length - 1);
      continue;
    }

    const date = cell(row, cols.date);
    // A line with no date is not a transaction (QuickBooks prints none, but a
    // "Beginning Balance" line in other layouts would be one); it is skipped
    // rather than invented into one.
    if (date === null) continue;
    const top = open.at(-1);
    const account = top === undefined ? undefined : accounts[top];
    if (top === undefined || !account) fail(`row ${rowNumber}: outside an account`);
    const distribution = cell(row, cols.account);
    if (distribution !== null && distribution !== account.name && !distribution.endsWith(`:${account.name}`)) {
      fail(`row ${rowNumber}: account`);
    }
    const amount = cell(row, cols.amount);
    if (amount === null) fail(`row ${rowNumber}: amount`);
    transactions.push({
      accountIndex: top,
      date: isoDate(date, rowNumber),
      type: cell(row, cols.type),
      num: cell(row, cols.num),
      name: cell(row, cols.name),
      description: cell(row, cols.description),
      split: cell(row, cols.split),
      amountCents: cents(amount, rowNumber),
    });
  }

  if (open.length > 0) fail('unclosed account');
  if (accounts.length === 0) fail('no accounts');

  return { company, periodLabel, period: parseLedgerPeriod(periodLabel), basis, accounts, transactions };
}
