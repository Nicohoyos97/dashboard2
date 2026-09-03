// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { buildHierarchy } from '@/lib/ingestion/hierarchy';
import { FinancialStatementSchema } from '@/lib/ingestion/schemas/financial-statement';
import type { FinancialStatementLine } from '@/lib/ingestion/schemas/financial-statement';

import { must, readExpected } from './helpers/anthropic-mock';

const pnl = FinancialStatementSchema.parse(readExpected('letter-and-pnl.json'));
const lines = (): FinancialStatementLine[] => structuredClone(pnl.lines);
const byName = <T extends { account_name: string }>(rows: T[], name: string): T =>
  must(
    rows.find((row) => row.account_name === name),
    name,
  );

function expectCode(fn: () => unknown, code: string): void {
  expect(fn).toThrow(expect.objectContaining({ name: 'IngestionError', code }));
}

describe('buildHierarchy', () => {
  it('links parents, assigns positions and converts amounts to cents', () => {
    const { rows, warnings } = buildHierarchy(pnl.lines);
    expect(warnings).toEqual([]);
    expect(rows.map((row) => row.position)).toEqual(rows.map((_, index) => index));
    const income = byName(rows, 'Income');
    const sales = byName(rows, 'Sales');
    expect(income.parentIndex).toBeNull();
    expect(sales.parentIndex).toBe(income.position);
    expect(sales.depth).toBe(1);
    expect(sales.currentCents).toBe(18540000);
    expect(sales.priorCents).toBe(16230000);
    expect(income.currentCents).toBeNull();
  });

  it('recomputes depth from the parents and reports the correction', () => {
    const tampered = lines();
    const sales = byName(tampered, 'Sales');
    sales.depth = 7;
    const { rows, warnings } = buildHierarchy(tampered);
    expect(byName(rows, 'Sales').depth).toBe(1);
    expect(warnings).toEqual([`${sales.ref}: depth corrected from 7 to 1`]);
  });

  it('rejects a parent_ref that does not exist', () => {
    const tampered = lines();
    byName(tampered, 'Sales').parent_ref = 'L999';
    expectCode(() => buildHierarchy(tampered), 'schema_invalid');
  });

  it('rejects cycles', () => {
    const tampered = lines();
    const income = byName(tampered, 'Income');
    const sales = byName(tampered, 'Sales');
    income.parent_ref = sales.ref;
    expectCode(() => buildHierarchy(tampered), 'schema_invalid');
    const self = lines();
    byName(self, 'Income').parent_ref = byName(self, 'Income').ref;
    expectCode(() => buildHierarchy(self), 'schema_invalid');
  });

  it('rejects duplicate refs', () => {
    const tampered = lines();
    byName(tampered, 'Sales').ref = byName(tampered, 'Income').ref;
    expectCode(() => buildHierarchy(tampered), 'schema_invalid');
  });

  it('handles a balance sheet with nested sections', () => {
    const sheet = FinancialStatementSchema.parse(readExpected('balance-sheet.json'));
    const { rows, warnings } = buildHierarchy(sheet.lines);
    expect(warnings).toEqual([]);
    expect(byName(rows, 'Checking').depth).toBe(2);
    expect(byName(rows, 'Total Assets').parentIndex).toBe(byName(rows, 'Assets').position);
  });
});
