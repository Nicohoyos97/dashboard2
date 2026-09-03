// Pass 1 output: what kind of page each page is, and — for statement pages —
// which report and period it belongs to.
import { z } from 'zod';

import { confidence, confidenceApi, isoDate, isoDateApi, page, pageApi, periodOrdered } from './common';

export const PAGE_KINDS = ['firm_letter', 'financial_statement', 'notes', 'other'] as const;
export const REPORT_TYPES = [
  'profit_and_loss',
  'balance_sheet',
  'bank_statement',
  'sales_tax',
  'income_tax',
  'payroll',
  'other',
] as const;

export type PageKind = (typeof PAGE_KINDS)[number];
export type ReportType = (typeof REPORT_TYPES)[number];

export const ClassificationApiSchema = z.object({
  pages: z.array(
    z.object({
      page: pageApi(),
      kind: z
        .enum(PAGE_KINDS)
        .describe(
          'firm_letter: cover letter or memo from the accounting firm; financial_statement: a page of a ' +
            'financial report, bank statement or tax document; notes: notes to the statements; other: anything else',
        ),
      report_type: z
        .enum(REPORT_TYPES)
        .describe('Only for financial_statement pages: the report the page belongs to')
        .optional(),
      period_start: isoDateApi('Start of the period printed on the page, if any').optional(),
      period_end: isoDateApi('End of the period or "as of" date printed on the page, if any').optional(),
      confidence: confidenceApi(),
    }),
  ),
});

const ClassifiedPageSchema = z
  .strictObject({
    page: page(),
    kind: z.enum(PAGE_KINDS),
    report_type: z.enum(REPORT_TYPES).optional(),
    period_start: isoDate().optional(),
    period_end: isoDate().optional(),
    confidence: confidence(),
  })
  .refine((p) => periodOrdered(p.period_start, p.period_end), { message: 'period_end precedes period_start' });

export const ClassificationSchema = z.strictObject({
  pages: z
    .array(ClassifiedPageSchema)
    .refine((pages) => new Set(pages.map((p) => p.page)).size === pages.length, {
      message: 'duplicate page',
    }),
});

export type Classification = z.infer<typeof ClassificationSchema>;
export type ClassifiedPage = Classification['pages'][number];
