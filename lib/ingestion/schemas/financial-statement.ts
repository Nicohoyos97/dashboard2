// Pass 2 output for a Profit & Loss or Balance Sheet: every printed line with
// its hierarchy hints. Totals are transcribed, never computed, so
// reconcile.ts can check them.
import { z } from 'zod';

import {
  bothOrNeither,
  confidence,
  confidenceApi,
  decimal,
  decimalApi,
  isoDate,
  isoDateApi,
  nonEmpty,
  page,
  pageApi,
  periodOrdered,
} from './common';

export const STATEMENT_TYPES = ['profit_and_loss', 'balance_sheet'] as const;
export const ACCOUNTING_BASES = ['cash', 'accrual'] as const;

export type StatementType = (typeof STATEMENT_TYPES)[number];

const LINE_REF_PATTERN = /^L[1-9]\d*$/;

const StatementLineApiSchema = z.object({
  ref: z.string().describe('Sequential line id in reading order: "L1", "L2", …'),
  parent_ref: z
    .string()
    .describe('ref of the section heading this line is indented under, or null for a top-level line')
    .nullable(),
  depth: z.int().describe('0 for top-level lines, +1 per level of indentation'),
  section: z
    .string()
    .describe('Top-level section heading the line belongs to, exactly as printed (e.g. "Income", "Expenses", "Assets")'),
  account_name: z.string().describe('Account or heading text exactly as printed'),
  account_number: z.string().describe('Account number if one is printed on the line').optional(),
  current: decimalApi('Current-period amount, or null when the line has no amount printed').nullable(),
  prior: decimalApi('Comparative-period amount when the statement prints a comparative column')
    .nullable()
    .optional(),
  is_section: z.boolean().describe('True when the line is a heading that groups the lines below it'),
  is_total: z.boolean().describe('True when the line is a printed total or subtotal'),
  page: pageApi(),
  source_text: z.string().describe('The whole line exactly as printed, including the amounts'),
  confidence: confidenceApi(),
});

export const FinancialStatementApiSchema = z.object({
  report_type: z.enum(STATEMENT_TYPES),
  entity_name: z.string().describe('Business name printed in the report header'),
  basis: z.enum(ACCOUNTING_BASES).describe('Accounting basis only if printed').optional(),
  statement_date: isoDateApi('"As of" date for a balance sheet, or the report date if printed').optional(),
  period_start: isoDateApi('For a balance sheet with only an "as of" date, repeat that date'),
  period_end: isoDateApi(),
  comparative_start: isoDateApi('Start of the comparative period, if one is printed').optional(),
  comparative_end: isoDateApi('End of the comparative period, if one is printed').optional(),
  currency: z.string().describe('ISO 4217 code, e.g. "USD"'),
  lines: z.array(StatementLineApiSchema),
  warnings: z.array(z.string()).describe('Anything illegible, ambiguous or unusual you noticed'),
});

export const FinancialStatementLineSchema = z.strictObject({
  ref: z.string().regex(LINE_REF_PATTERN),
  parent_ref: z.string().regex(LINE_REF_PATTERN).nullable(),
  depth: z.int().min(0),
  section: nonEmpty(),
  account_name: nonEmpty(),
  account_number: z.string().optional(),
  current: decimal().nullable(),
  prior: decimal().nullable().optional(),
  is_section: z.boolean(),
  is_total: z.boolean(),
  page: page(),
  source_text: nonEmpty(),
  confidence: confidence(),
});

export const FinancialStatementSchema = z
  .strictObject({
    report_type: z.enum(STATEMENT_TYPES),
    entity_name: nonEmpty(),
    basis: z.enum(ACCOUNTING_BASES).optional(),
    statement_date: isoDate().optional(),
    period_start: isoDate(),
    period_end: isoDate(),
    comparative_start: isoDate().optional(),
    comparative_end: isoDate().optional(),
    currency: z.string().regex(/^[A-Z]{3}$/),
    lines: z
      .array(FinancialStatementLineSchema)
      .min(1)
      .refine((lines) => new Set(lines.map((l) => l.ref)).size === lines.length, {
        message: 'duplicate ref',
      }),
    warnings: z.array(z.string()),
  })
  .refine((s) => periodOrdered(s.period_start, s.period_end), { message: 'period_end precedes period_start' })
  .refine((s) => bothOrNeither(s.comparative_start, s.comparative_end), {
    message: 'comparative_start and comparative_end come together',
  })
  .refine((s) => periodOrdered(s.comparative_start, s.comparative_end), {
    message: 'comparative_end precedes comparative_start',
  });

export type FinancialStatement = z.infer<typeof FinancialStatementSchema>;
export type FinancialStatementLine = z.infer<typeof FinancialStatementLineSchema>;
