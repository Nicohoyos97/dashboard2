// CSV exports: deterministic parsing with papaparse, a model-proposed column
// mapping the admin confirms, deterministic application of that mapping, and
// the dedupe key (date, amount, normalised description, account) from spec §9.
import { createHash } from 'node:crypto';

import type Anthropic from '@anthropic-ai/sdk';
import Papa from 'papaparse';

import { modelOptions } from '@/lib/ai/models';
import { MoneyParseError, fromCents, toCents } from '@/lib/money';

import { IngestionError } from './errors';
import { CSV_MAPPING_SYSTEM_PROMPT, csvMappingInstruction } from './prompts';
import { requestStructured, textBlock } from './request';
import type { TokenUsage } from './request';
import { CsvMappingApiSchema, CsvMappingSchema } from './schemas/csv-mapping';
import type { CsvDateFormat, CsvMapping } from './schemas/csv-mapping';

export const MAX_SAMPLE_ROWS = 20;

export type CsvRow = Record<string, string>;
export type CsvTable = { headers: string[]; rows: CsvRow[] };

export function parseCsv(text: string): CsvTable {
  const result = Papa.parse<Record<string, string | undefined>>(text, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (header) => header.trim(),
  });
  const headers = result.meta.fields ?? [];
  if (headers.length === 0 || headers.includes('') || new Set(headers).size !== headers.length) {
    throw new IngestionError('csv_unparseable', 'headers');
  }
  const error = result.errors[0];
  if (error) throw new IngestionError('csv_unparseable', error.type);
  if (result.data.length === 0) throw new IngestionError('csv_unparseable', 'no rows');
  const rows = result.data.map((row) => Object.fromEntries(headers.map((h) => [h, row[h] ?? ''])));
  return { headers, rows };
}

export type ProposeCsvMappingInput = {
  headers: readonly string[];
  sampleRows: readonly CsvRow[];
  anthropic: Anthropic;
  model?: string | undefined;
};

export async function proposeCsvMapping(
  input: ProposeCsvMappingInput,
): Promise<{ mapping: CsvMapping; usage: TokenUsage }> {
  const result = await requestStructured({
    anthropic: input.anthropic,
    options: modelOptions('fast', input.model),
    system: CSV_MAPPING_SYSTEM_PROMPT,
    content: [textBlock(csvMappingInstruction(input.headers, input.sampleRows.slice(0, MAX_SAMPLE_ROWS)))],
    apiSchema: CsvMappingApiSchema,
    strictSchema: CsvMappingSchema,
  });
  for (const [field, header] of Object.entries(result.data.columns)) {
    if (header !== null && !input.headers.includes(header)) {
      throw new IngestionError('csv_mapping_invalid', `columns.${field}`);
    }
  }
  return { mapping: result.data, usage: result.usage };
}

/** Deterministic date parsing for the closed list of formats the mapping may name. */
export function parseCsvDate(raw: string, format: CsvDateFormat): string | null {
  const separator = format.includes('/') ? '/' : '-';
  const tokens = format.split(separator);
  const parts = raw.trim().split(separator);
  if (parts.length !== tokens.length || parts.some((part) => !/^\d{1,4}$/.test(part))) return null;
  const values: Record<string, number> = {};
  tokens.forEach((token, index) => {
    values[token] = Number(parts[index]);
  });
  const year = values.YYYY ?? (values.YY === undefined ? undefined : 2000 + values.YY);
  const month = values.MM;
  const day = values.DD;
  if (year === undefined || month === undefined || day === undefined) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  const valid = date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  return valid ? date.toISOString().slice(0, 10) : null;
}

export type CsvTransaction = {
  row: number;
  date: string;
  description: string;
  debit: string | null;
  credit: string | null;
  balance: string | null;
};

export type CsvSkipReason = 'invalid_date' | 'invalid_amount' | 'missing_amount';
export type CsvSkipped = { row: number; reason: CsvSkipReason };

function optionalCents(value: string | undefined): number | null {
  const trimmed = value?.trim() ?? '';
  return trimmed === '' ? null : toCents(trimmed);
}

function movement(row: CsvRow, mapping: CsvMapping): { debit: string | null; credit: string | null } | CsvSkipReason {
  const { columns, sign_convention } = mapping;
  try {
    if (sign_convention === 'debit_credit') {
      const debit = columns.debit ? optionalCents(row[columns.debit]) : null;
      const credit = columns.credit ? optionalCents(row[columns.credit]) : null;
      // A printed zero is a row that moves no money — a balance-forward line, a
      // reversed fee. It has to be skipped here rather than emitted, because
      // bank_transactions requires at least one side to be non-null and the
      // chunked upsert fails the whole import on the constraint. The guard and
      // the transform disagreeing about what "no amount" means is what let one
      // such line kill a 400-row export.
      if ((debit ?? 0) === 0 && (credit ?? 0) === 0) return 'missing_amount';
      return {
        debit: debit === null || debit === 0 ? null : fromCents(Math.abs(debit)),
        credit: credit === null || credit === 0 ? null : fromCents(Math.abs(credit)),
      };
    }
    const amount = columns.amount ? optionalCents(row[columns.amount]) : null;
    if (amount === null) return 'missing_amount';
    const isDebit = sign_convention === 'positive_is_debit' ? amount > 0 : amount < 0;
    const magnitude = fromCents(Math.abs(amount));
    return isDebit ? { debit: magnitude, credit: null } : { debit: null, credit: magnitude };
  } catch (error) {
    if (error instanceof MoneyParseError) return 'invalid_amount';
    throw error;
  }
}

export function applyCsvMapping(
  rows: readonly CsvRow[],
  mapping: CsvMapping,
): { transactions: CsvTransaction[]; skipped: CsvSkipped[] } {
  const transactions: CsvTransaction[] = [];
  const skipped: CsvSkipped[] = [];
  rows.forEach((row, index) => {
    const rowNumber = index + 1;
    const date = parseCsvDate(row[mapping.columns.date] ?? '', mapping.date_format);
    if (date === null) {
      skipped.push({ row: rowNumber, reason: 'invalid_date' });
      return;
    }
    const amounts = movement(row, mapping);
    if (typeof amounts === 'string') {
      skipped.push({ row: rowNumber, reason: amounts });
      return;
    }
    let balance: string | null = null;
    if (mapping.columns.balance) {
      try {
        const cents = optionalCents(row[mapping.columns.balance]);
        balance = cents === null ? null : fromCents(cents);
      } catch {
        balance = null;
      }
    }
    transactions.push({
      row: rowNumber,
      date,
      description: (row[mapping.columns.description] ?? '').trim(),
      ...amounts,
      balance,
    });
  });
  return { transactions, skipped };
}

export function normalizeDescription(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function dedupeKey(parts: { date: string; amountCents: number; description: string; account: string }): string {
  const material = `${parts.date}|${parts.amountCents}|${normalizeDescription(parts.description)}|${parts.account}`;
  return createHash('sha256').update(material).digest('hex');
}
