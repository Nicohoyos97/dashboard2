// Pass 2 output for a point-of-sale sales report (Clover, Toast, Square,
// Stripe). This is the document that says what was *sold*; a state tax filing
// says what is *owed*, and the two must not feed the same figures — see
// migration 0022, and tax-record.ts, which no longer reads sales at all.
//
// Every money field is optional because no two vendors print the same set:
// Clover prints "Amount collected", Square does not; Toast separates
// discounts, Stripe does not. A figure the report did not print stays null
// rather than becoming a zero that reads like a fact.
import { z } from 'zod';

import {
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

export const POS_SYSTEMS = ['clover', 'toast', 'square', 'stripe', 'other'] as const;
export type PosSystem = (typeof POS_SYSTEMS)[number];

const TenderApiSchema = z.object({
  label: z.string().describe('Tender name exactly as printed, e.g. "Credit and debit cards", "Cash", "DOORDASH"'),
  amount: decimalApi('Total for this tender'),
});

export const SalesReportApiSchema = z.object({
  source_system: z
    .enum(POS_SYSTEMS)
    .describe('The point-of-sale system that produced the report, from its branding or footer'),
  period_start: isoDateApi('First day the report covers'),
  period_end: isoDateApi('Last day the report covers'),
  currency: z.string().describe('ISO currency code of the printed amounts, e.g. USD'),
  gross_sales: decimalApi('Gross sales before refunds and discounts').nullable().optional(),
  net_sales: decimalApi('Net sales after refunds and discounts').nullable().optional(),
  refunds: decimalApi('Refunds as an unsigned amount, even when printed negative').nullable().optional(),
  discounts: decimalApi('Discounts as an unsigned amount').nullable().optional(),
  tips: decimalApi('Tips collected').nullable().optional(),
  tax_collected: decimalApi('Sales tax actually collected').nullable().optional(),
  tax_expected: decimalApi('Sales tax the report says was expected, when it prints both').nullable().optional(),
  amount_collected: decimalApi('Total money taken in, including tax and tips').nullable().optional(),
  order_count: z.number().int().nonnegative().describe('Number of orders or transactions').nullable().optional(),
  tenders: z
    .array(TenderApiSchema)
    .describe('Breakdown by how the money arrived. Use the vendor\'s own labels; do not merge or rename them.')
    .optional(),
  page: pageApi('Page the totals were read from'),
  confidence: confidenceApi(),
});

const TenderSchema = z.strictObject({ label: nonEmpty(), amount: decimal() });

export const SalesReportSchema = z
  .strictObject({
    source_system: z.enum(POS_SYSTEMS),
    period_start: isoDate(),
    period_end: isoDate(),
    currency: z.string().trim().length(3).toUpperCase(),
    gross_sales: decimal().nullable().optional(),
    net_sales: decimal().nullable().optional(),
    refunds: decimal().nullable().optional(),
    discounts: decimal().nullable().optional(),
    tips: decimal().nullable().optional(),
    tax_collected: decimal().nullable().optional(),
    tax_expected: decimal().nullable().optional(),
    amount_collected: decimal().nullable().optional(),
    order_count: z.number().int().nonnegative().nullable().optional(),
    tenders: z.array(TenderSchema).optional(),
    page: page(),
    confidence: confidence(),
  })
  .refine((r) => periodOrdered(r.period_start, r.period_end), {
    message: 'period_end precedes period_start',
  });

export type SalesReport = z.infer<typeof SalesReportSchema>;
export type SalesReportTender = z.infer<typeof TenderSchema>;
