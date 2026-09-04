// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { buildHierarchy } from '@/lib/ingestion/hierarchy';
import {
  CONFIDENCE_THRESHOLD,
  RECONCILE_TOLERANCE_CENTS,
  reconcileBankStatement,
  reconcileCsvExport,
  reconcileSalesTax,
  reconcileStatement,
} from '@/lib/ingestion/reconcile';
import type { Reconciliation } from '@/lib/ingestion/reconcile';
import { BankActivitySchema } from '@/lib/ingestion/schemas/bank-activity';
import { FinancialStatementSchema } from '@/lib/ingestion/schemas/financial-statement';
import type { FinancialStatement } from '@/lib/ingestion/schemas/financial-statement';
import { TaxRecordSchema } from '@/lib/ingestion/schemas/tax-record';

import { must, readExpected } from './helpers/anthropic-mock';

const statement = (name: string) => FinancialStatementSchema.parse(readExpected(name));
const check = (r: Reconciliation, key: string) => must(r.checks.find((c) => c.key === key), key);
const line = (s: FinancialStatement, name: string) => must(s.lines.find((l) => l.account_name === name), name);
const reconcile = (s: FinancialStatement) => reconcileStatement(buildHierarchy(s.lines).rows, s.report_type);

describe('reconcileStatement — profit and loss', () => {
  const pnl = statement('letter-and-pnl.json');

  it('passes on the fixture, checking every subtotal and the named relationships in both columns', () => {
    const result = reconcile(pnl);
    expect(result.passed).toBe(true);
    expect(result.checks.map((c) => c.key)).toEqual([
      'subtotal:L4', 'subtotal:L8', 'subtotal:L20', 'gross_profit', 'net_income',
      'subtotal:L4:prior', 'subtotal:L8:prior', 'subtotal:L20:prior', 'gross_profit:prior', 'net_income:prior',
    ]);
    expect(check(result, 'gross_profit')).toMatchObject({
      ok: true, expectedCents: 14795025, actualCents: 14795025, toleranceCents: RECONCILE_TOLERANCE_CENTS,
    });
    expect(check(result, 'net_income')).toMatchObject({ ok: true, expectedCents: 3834490, actualCents: 3834490 });
    expect(check(result, 'net_income:prior').actualCents).toBe(2864440);
    expect(result.lowConfidence).toEqual({ count: 0, refs: [] });
  });

  it('fails when a printed subtotal does not add up, and everything derived from it', () => {
    const tampered = structuredClone(pnl);
    const total = line(tampered, 'Total Expenses');
    total.current = '109855.35';
    const result = reconcile(tampered);
    expect(result.passed).toBe(false);
    expect(check(result, `subtotal:${total.ref}`)).toMatchObject({ ok: false, expectedCents: 10960535, actualCents: 10985535 });
    expect(check(result, 'net_income').ok).toBe(false);
    expect(check(result, 'gross_profit').ok).toBe(true);
    expect(check(result, `subtotal:${total.ref}:prior`).ok).toBe(true);
  });

  it('tolerates rounding up to RECONCILE_TOLERANCE_CENTS and not a cent more', () => {
    const within = structuredClone(pnl);
    line(within, 'Total Expenses').current = '109606.35';
    expect(check(reconcile(within), 'subtotal:L20').ok).toBe(true);
    const beyond = structuredClone(pnl);
    line(beyond, 'Total Expenses').current = '109606.36';
    expect(check(reconcile(beyond), 'subtotal:L20').ok).toBe(false);
  });

  it('flags lines under the confidence threshold even when every check passes', () => {
    const tampered = structuredClone(pnl);
    line(tampered, 'Sales').confidence = CONFIDENCE_THRESHOLD - 0.01;
    const result = reconcile(tampered);
    expect(result.checks.every((c) => c.ok)).toBe(true);
    expect(result.lowConfidence).toEqual({ count: 1, refs: ['L2'] });
    expect(result.passed).toBe(false);
  });

  it('checks only the current column when no comparative figures are present', () => {
    const single = structuredClone(pnl);
    for (const l of single.lines) delete l.prior;
    const result = reconcile(single);
    expect(result.passed).toBe(true);
    expect(result.checks.map((c) => c.key)).toEqual(['subtotal:L4', 'subtotal:L8', 'subtotal:L20', 'gross_profit', 'net_income']);
  });
});

describe('reconcileStatement — balance sheet', () => {
  it('passes on the balanced fixture with nested sections', () => {
    const result = reconcile(statement('balance-sheet.json'));
    expect(result.passed).toBe(true);
    expect(result.checks.map((c) => c.key)).toEqual([
      'subtotal:L6', 'subtotal:L10', 'subtotal:L11', 'subtotal:L18', 'subtotal:L21', 'subtotal:L22', 'subtotal:L26', 'subtotal:L27', 'balance_equation',
    ]);
    expect(check(result, 'balance_equation')).toMatchObject({ ok: true, expectedCents: 13715035, actualCents: 13715035 });
  });

  it('fails the balance equation on the unbalanced fixture by exactly $250.00', () => {
    const result = reconcile(statement('balance-sheet-unbalanced.json'));
    expect(result.passed).toBe(false);
    const equation = check(result, 'balance_equation');
    expect(equation.ok).toBe(false);
    expect(equation.actualCents - equation.expectedCents).toBe(25000);
    expect(result.checks.filter((c) => c.key !== 'balance_equation').every((c) => c.ok)).toBe(true);
  });
});

describe('reconcileBankStatement', () => {
  const bank = BankActivitySchema.parse(readExpected('bank-statement.json'));

  it('passes on the fixture: balances tie out and the running balance is continuous', () => {
    const result = reconcileBankStatement(bank);
    expect(result.passed).toBe(true);
    expect(result.checks.map((c) => c.key)).toEqual(['ending_balance', 'running_balance']);
    expect(check(result, 'ending_balance')).toMatchObject({ ok: true, expectedCents: 3683686, actualCents: 3683686 });
  });

  it('fails when the printed ending balance disagrees with beginning + credits − debits', () => {
    const tampered = structuredClone(bank);
    tampered.ending_balance = '36936.86';
    const result = reconcileBankStatement(tampered);
    expect(result.passed).toBe(false);
    expect(check(result, 'ending_balance')).toMatchObject({ ok: false, expectedCents: 3683686, actualCents: 3693686 });
    expect(check(result, 'running_balance').ok).toBe(true);
  });

  it('fails running-balance continuity at the first broken line', () => {
    const tampered = structuredClone(bank);
    must(tampered.transactions[3]).running_balance = '48736.75';
    const result = reconcileBankStatement(tampered);
    expect(check(result, 'running_balance')).toMatchObject({ ok: false, expectedCents: 4873175, actualCents: 4873675 });
    expect(check(result, 'ending_balance').ok).toBe(true);
  });

  it('skips the running-balance check when the statement prints none', () => {
    const bare = structuredClone(bank);
    for (const t of bare.transactions) t.running_balance = null;
    const result = reconcileBankStatement(bare);
    expect(result.checks.map((c) => c.key)).toEqual(['ending_balance']);
    expect(result.passed).toBe(true);
  });

  it('flags low-confidence transactions by position', () => {
    const tampered = structuredClone(bank);
    must(tampered.transactions[4]).confidence = 0.5;
    const result = reconcileBankStatement(tampered);
    expect(result.lowConfidence).toEqual({ count: 1, refs: ['T5'] });
    expect(result.passed).toBe(false);
  });
});

describe('reconcileSalesTax', () => {
  const tax = TaxRecordSchema.parse(readExpected('sales-tax-confirmation.json'));

  it('checks collected − paid = payable on the fixture', () => {
    const result = reconcileSalesTax(tax);
    expect(result.passed).toBe(true);
    expect(check(result, 'sales_tax_payable')).toMatchObject({ ok: true, expectedCents: 0, actualCents: 0 });
  });

  it('fails when the payable balance does not follow from collected and paid', () => {
    const result = reconcileSalesTax({ ...tax, amount_payable: '150.00' });
    expect(result.passed).toBe(false);
    expect(check(result, 'sales_tax_payable')).toMatchObject({ ok: false, expectedCents: 0, actualCents: 15000 });
  });

  it('has nothing to check when one of the three figures is missing', () => {
    const partial = { ...tax };
    delete partial.tax_collected;
    const result = reconcileSalesTax(partial);
    expect(result.checks).toEqual([]);
    expect(result.passed).toBe(true);
  });

  it('flags a low-confidence record', () => {
    const result = reconcileSalesTax({ ...tax, confidence: 0.6 });
    expect(result.lowConfidence).toEqual({ count: 1, refs: ['record'] });
    expect(result.passed).toBe(false);
  });
});

describe('reconcileBankStatement — the equation follows the account category', () => {
  // Everything is a debit or a credit depending on whether the account is an
  // asset, a liability, equity, income or expense. Under this repo's extraction
  // convention (debit = money out, credit = money in), a depository account's
  // balance rises with money in; a credit card or loan prints the amount OWED,
  // which rises with money out. Reconciliation assumed the asset equation for
  // every account, so no card statement could ever tie out — and per A2 there
  // was no correction path either, which made them permanently unpublishable.
  const card = {
    institution: 'Amex',
    account_kind: 'credit_card' as const,
    masked_account: '****1005',
    period_start: '2026-03-01',
    period_end: '2026-03-31',
    beginning_balance: '2340.18',
    ending_balance: '1875.42',
    transactions: [
      // A purchase: money leaves the cardholder, the balance owed goes up.
      { date: '2026-03-04', description: 'Sysco Foods', debit: '1875.42', page: 1, confidence: 0.99 },
      // A payment to the card: money arrives, the balance owed goes down.
      { date: '2026-03-20', description: 'Payment received', credit: '2340.18', page: 1, confidence: 0.99 },
    ],
  };

  it('ties out a credit card statement', () => {
    const result = reconcileBankStatement(BankActivitySchema.parse(card));
    expect(check(result, 'ending_balance')).toMatchObject({ ok: true, expectedCents: 187542, actualCents: 187542 });
    expect(result.passed).toBe(true);
  });

  it('ties out a loan statement the same way', () => {
    const loan = { ...card, account_kind: 'loan' as const };
    expect(reconcileBankStatement(BankActivitySchema.parse(loan)).passed).toBe(true);
  });

  it('would not tie out under the asset equation, which is the bug', () => {
    // The same figures read as a checking account: 2340.18 + 2340.18 − 1875.42.
    const asDepository = { ...card, account_kind: 'depository' as const };
    const result = reconcileBankStatement(BankActivitySchema.parse(asDepository));
    expect(check(result, 'ending_balance')).toMatchObject({ ok: false, expectedCents: 280494 });
  });

  it('names the equation it used, so the firm can see which one applied', () => {
    const asset = reconcileBankStatement(BankActivitySchema.parse({ ...card, account_kind: 'depository' as const }));
    expect(check(asset, 'ending_balance').label).toMatch(/credits − debits/);
    const liability = reconcileBankStatement(BankActivitySchema.parse(card));
    expect(check(liability, 'ending_balance').label).toMatch(/debits − credits/);
  });
});

describe('reconcileCsvExport', () => {
  const row = (date: string, debit: string | null, credit: string | null, balance: string | null) => ({
    date,
    description: 'row',
    debit,
    credit,
    balance,
  });

  it('passes a clean export: every row parsed, balances continuous', () => {
    // A transaction export is a ledger, not a report: it prints no beginning or
    // ending balance to tie out against. Recording `passed: false` for that
    // conflated "failed" with "not applicable", and since publishBlockers
    // requires a pass, a clean 400-row CSV could never be published.
    const result = reconcileCsvExport(
      [row('2026-03-01', '25.00', null, '975.00'), row('2026-03-02', null, '100.00', '1075.00')],
      [],
    );
    expect(result.passed).toBe(true);
    expect(result.checks.map((c) => c.key)).toEqual(['rows_parsed', 'running_balance']);
  });

  it('fails when the parser had to skip a row', () => {
    const result = reconcileCsvExport([row('2026-03-01', '25.00', null, null)], [
      { row: 7, reason: 'invalid_date' },
    ]);
    expect(result.passed).toBe(false);
    expect(check(result, 'rows_parsed')).toMatchObject({ ok: false, expectedCents: 2, actualCents: 1 });
  });

  it('fails when a printed running balance breaks continuity', () => {
    const result = reconcileCsvExport(
      [row('2026-03-01', '25.00', null, '975.00'), row('2026-03-02', null, '100.00', '9999.00')],
      [],
    );
    expect(result.passed).toBe(false);
    expect(check(result, 'running_balance')).toMatchObject({ ok: false, expectedCents: 107500, actualCents: 999900 });
  });

  it('checks only what the export prints: no balance column, no continuity check', () => {
    const result = reconcileCsvExport([row('2026-03-01', '25.00', null, null)], []);
    expect(result.checks.map((c) => c.key)).toEqual(['rows_parsed']);
    expect(result.passed).toBe(true);
  });
});
