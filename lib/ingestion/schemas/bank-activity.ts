// Pass 2 output for a bank statement. Debits and credits are unsigned
// magnitudes in their own columns; reconcile.ts checks them against the
// printed balances.
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
  unsignedDecimal,
} from './common';

const MAX_VISIBLE_ACCOUNT_DIGITS = 4;

const TransactionApiSchema = z.object({
  date: isoDateApi('Transaction date'),
  posting_date: isoDateApi('Posting date when printed separately').optional(),
  description: z.string().describe('Description exactly as printed'),
  debit: decimalApi('Money out, as an unsigned amount; null when the line is a credit').nullable().optional(),
  credit: decimalApi('Money in, as an unsigned amount; null when the line is a debit').nullable().optional(),
  running_balance: decimalApi('Balance printed on the line, if any').nullable().optional(),
  page: pageApi(),
  confidence: confidenceApi(),
});

// Whether the printed balance is something the business owns or something it
// owes. It decides the reconciliation equation, so it cannot be inferred later:
// on a depository account the balance rises with money in, on a credit card or
// a loan the printed figure is the amount owed and rises with money out.
export const ACCOUNT_KINDS = ['depository', 'credit_card', 'loan', 'other'] as const;

export const BankActivityApiSchema = z.object({
  institution: z.string().describe('Bank name as printed'),
  account_kind: z
    .enum(ACCOUNT_KINDS)
    .describe(
      'What kind of account this statement is for. "depository" for a checking or savings account, ' +
        '"credit_card" for a credit card statement, "loan" for a loan or line of credit, ' +
        '"other" when the document does not say. Read it from the statement heading, not from the transactions.',
    ),
  masked_account: z
    .string()
    .describe('Account identifier with at most the last four digits visible, e.g. "****4821". Never the full number'),
  period_start: isoDateApi(),
  period_end: isoDateApi(),
  beginning_balance: decimalApi(),
  ending_balance: decimalApi(),
  transactions: z.array(TransactionApiSchema).describe('Every transaction line, in statement order'),
});

export const BankTransactionSchema = z
  .strictObject({
    date: isoDate(),
    posting_date: isoDate().optional(),
    description: nonEmpty(),
    debit: unsignedDecimal().nullable().optional(),
    credit: unsignedDecimal().nullable().optional(),
    running_balance: decimal().nullable().optional(),
    page: page(),
    confidence: confidence(),
  })
  .refine((t) => (t.debit ?? null) !== null || (t.credit ?? null) !== null, {
    message: 'a transaction needs a debit or a credit',
  });

export const BankActivitySchema = z
  .strictObject({
    institution: nonEmpty(),
    account_kind: z.enum(ACCOUNT_KINDS).catch('other'),
    masked_account: nonEmpty().refine(
      (v) => (v.match(/\d/g) ?? []).length <= MAX_VISIBLE_ACCOUNT_DIGITS,
      { message: 'account number is not masked' },
    ),
    period_start: isoDate(),
    period_end: isoDate(),
    beginning_balance: decimal(),
    ending_balance: decimal(),
    transactions: z.array(BankTransactionSchema),
  })
  .refine((s) => periodOrdered(s.period_start, s.period_end), { message: 'period_end precedes period_start' });

export type BankActivity = z.infer<typeof BankActivitySchema>;
export type BankTransaction = z.infer<typeof BankTransactionSchema>;
