// Pass 2 output for a tax filing or payment confirmation. The model may not
// mark a record `firm_confirmed` — that status is set by the firm — so the API
// enum is a subset of the stored one.
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

export const TAX_TYPES = ['income', 'sales', 'payroll'] as const;
export const TAX_STATUSES = ['estimated', 'firm_confirmed', 'paid', 'payable', 'pending_review'] as const;
export const EXTRACTED_TAX_STATUSES = ['estimated', 'paid', 'payable', 'pending_review'] as const;

export type TaxType = (typeof TAX_TYPES)[number];
export type TaxStatus = (typeof TAX_STATUSES)[number];

export const TaxRecordApiSchema = z.object({
  tax_type: z.enum(TAX_TYPES),
  jurisdiction: z.string().describe('Taxing authority as printed, e.g. "Colorado Department of Revenue"'),
  filing_period_start: isoDateApi().optional(),
  filing_period_end: isoDateApi().optional(),
  due_date: isoDateApi().optional(),
  amount_paid: decimalApi().optional(),
  amount_payable: decimalApi('Remaining amount due after payments, if printed').optional(),
  taxable_sales: decimalApi().optional(),
  non_taxable_sales: decimalApi().optional(),
  tax_collected: decimalApi().optional(),
  payment_date: isoDateApi().optional(),
  status: z
    .enum(EXTRACTED_TAX_STATUSES)
    .describe('paid when a payment is confirmed; payable when a balance is due; estimated for estimates; pending_review when unclear'),
  confirmation_number: z.string().optional(),
  page: pageApi('Page the figures were read from'),
  confidence: confidenceApi(),
});

export const TaxRecordSchema = z
  .strictObject({
    tax_type: z.enum(TAX_TYPES),
    jurisdiction: nonEmpty(),
    filing_period_start: isoDate().optional(),
    filing_period_end: isoDate().optional(),
    due_date: isoDate().optional(),
    amount_paid: decimal().optional(),
    amount_payable: decimal().optional(),
    taxable_sales: decimal().optional(),
    non_taxable_sales: decimal().optional(),
    tax_collected: decimal().optional(),
    payment_date: isoDate().optional(),
    status: z.enum(TAX_STATUSES),
    confirmation_number: z.string().optional(),
    page: page(),
    confidence: confidence(),
  })
  .refine((r) => periodOrdered(r.filing_period_start, r.filing_period_end), {
    message: 'filing_period_end precedes filing_period_start',
  });

export type TaxRecord = z.infer<typeof TaxRecordSchema>;
