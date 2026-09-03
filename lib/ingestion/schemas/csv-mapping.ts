// The fast model proposes how a CSV export's columns map onto transactions;
// the admin confirms before anything is applied (spec §9). Date formats are a
// closed list so csv.ts can parse them deterministically.
import { z } from 'zod';

export const CSV_DATE_FORMATS = [
  'YYYY-MM-DD',
  'MM/DD/YYYY',
  'DD/MM/YYYY',
  'MM-DD-YYYY',
  'DD-MM-YYYY',
  'YYYY/MM/DD',
  'MM/DD/YY',
  'DD/MM/YY',
] as const;

export const SIGN_CONVENTIONS = [
  'debit_credit',
  'signed_amount',
  'negative_is_debit',
  'positive_is_debit',
] as const;

export type CsvDateFormat = (typeof CSV_DATE_FORMATS)[number];
export type SignConvention = (typeof SIGN_CONVENTIONS)[number];

const columns = () =>
  z.object({
    date: z.string().describe('Header of the transaction date column'),
    description: z.string().describe('Header of the description / payee column'),
    debit: z.string().describe('Header of the money-out column, or null').nullable(),
    credit: z.string().describe('Header of the money-in column, or null').nullable(),
    amount: z.string().describe('Header of a single signed amount column, or null').nullable(),
    balance: z.string().describe('Header of the running balance column, or null').nullable(),
  });

export const CsvMappingApiSchema = z.object({
  columns: columns(),
  date_format: z.enum(CSV_DATE_FORMATS).describe('Format of the values in the date column'),
  sign_convention: z
    .enum(SIGN_CONVENTIONS)
    .describe(
      'debit_credit: separate debit and credit columns; signed_amount / negative_is_debit: one amount column ' +
        'where negatives are money out; positive_is_debit: one amount column where positives are money out',
    ),
});

export const CsvMappingSchema = z
  .strictObject({
    columns: z.strictObject({
      date: z.string().min(1),
      description: z.string().min(1),
      debit: z.string().min(1).nullable(),
      credit: z.string().min(1).nullable(),
      amount: z.string().min(1).nullable(),
      balance: z.string().min(1).nullable(),
    }),
    date_format: z.enum(CSV_DATE_FORMATS),
    sign_convention: z.enum(SIGN_CONVENTIONS),
  })
  .refine(
    (m) =>
      m.sign_convention === 'debit_credit'
        ? m.columns.debit !== null || m.columns.credit !== null
        : m.columns.amount !== null,
    { message: 'sign_convention needs its amount column(s)' },
  );

export type CsvMapping = z.infer<typeof CsvMappingSchema>;
