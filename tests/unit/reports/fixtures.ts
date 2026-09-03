// Small statements shared by the report tests. Amounts are integer cents.
import type { LineRow, ReportRow } from '@/lib/reports/types';

type LineSpec = {
  parent?: string | null;
  section?: string | null;
  current?: number | null;
  prior?: number | null;
  isSection?: boolean;
  isTotal?: boolean;
  page?: number | null;
  number?: string | null;
  depth?: number;
};

let position = 0;

export function line(id: string, accountName: string, spec: LineSpec = {}): LineRow {
  position += 1;
  return {
    id,
    parentLineId: spec.parent ?? null,
    position,
    depth: spec.depth ?? 0,
    section: spec.section ?? null,
    accountName,
    accountNumber: spec.number ?? null,
    currentCents: spec.current ?? null,
    priorCents: spec.prior ?? null,
    isSection: spec.isSection ?? false,
    isTotal: spec.isTotal ?? false,
    pageNumber: spec.page ?? 1,
    confidence: 0.99,
  };
}

export function resetPositions(): void {
  position = 0;
}

export function report(overrides: Partial<ReportRow> = {}): ReportRow {
  return {
    id: 'report-1',
    reportType: 'profit_and_loss',
    basis: 'accrual',
    currency: 'USD',
    periodStart: '2026-01-01',
    periodEnd: '2026-06-30',
    comparativeStart: '2025-01-01',
    comparativeEnd: '2025-06-30',
    source: 'firm_document',
    documentVersionId: 'version-1',
    publishedAt: '2026-08-01T00:00:00Z',
    ...overrides,
  };
}

/** Income / COGS / Gross Profit / Expenses / Net Income, with a comparative column. */
export function pnlRows(): LineRow[] {
  resetPositions();
  return [
    line('L1', 'Income', { section: 'Income', isSection: true }),
    line('L2', 'Sales', { parent: 'L1', section: 'Income', current: 1_000_000, prior: 800_000, depth: 1 }),
    line('L3', 'Services', { parent: 'L1', section: 'Income', current: 500_000, prior: 500_000, depth: 1 }),
    line('L4', 'Total Income', { parent: 'L1', section: 'Income', current: 1_500_000, prior: 1_300_000, isTotal: true, depth: 1 }),
    line('L5', 'Cost of Goods Sold', { section: 'Cost of Goods Sold', isSection: true }),
    line('L6', 'Materials', { parent: 'L5', section: 'Cost of Goods Sold', current: 400_000, prior: 300_000, depth: 1 }),
    line('L7', 'Total Cost of Goods Sold', { parent: 'L5', section: 'Cost of Goods Sold', current: 400_000, prior: 300_000, isTotal: true, depth: 1 }),
    line('L8', 'Gross Profit', { section: 'Gross Profit', current: 1_100_000, prior: 1_000_000, isTotal: true, page: 2 }),
    line('L9', 'Expenses', { section: 'Expenses', isSection: true, page: 2 }),
    line('L10', 'Payroll Expenses', { parent: 'L9', section: 'Expenses', current: 500_000, prior: 300_000, depth: 1, page: 2, number: '6000' }),
    line('L11', 'Rent', { parent: 'L9', section: 'Expenses', current: 200_000, prior: 200_000, depth: 1, page: 2 }),
    line('L12', 'Office Supplies', { parent: 'L9', section: 'Expenses', current: 0, prior: 0, depth: 1, page: 2 }),
    line('L13', 'Total Expenses', { parent: 'L9', section: 'Expenses', current: 700_000, prior: 500_000, isTotal: true, depth: 1, page: 2 }),
    line('L14', 'Net Operating Income', { section: 'Net Operating Income', current: 400_000, prior: 500_000, isTotal: true, page: 2 }),
    line('L15', 'Net Income', { section: 'Net Income', current: 400_000, prior: 500_000, isTotal: true, page: 2 }),
  ];
}

/** Assets (current + fixed) and Liabilities & Equity (current + long-term + equity), comparative column. */
export function balanceRows(): LineRow[] {
  resetPositions();
  return [
    line('B1', 'Assets', { section: 'Assets', isSection: true }),
    line('B2', 'Current Assets', { parent: 'B1', section: 'Assets', isSection: true, depth: 1 }),
    line('B3', 'Cash', { parent: 'B2', section: 'Assets', current: 500_000, prior: 400_000, depth: 2 }),
    line('B4', 'Accounts Receivable', { parent: 'B2', section: 'Assets', current: 300_000, prior: 200_000, depth: 2 }),
    line('B5', 'Total Current Assets', { parent: 'B2', section: 'Assets', current: 800_000, prior: 600_000, isTotal: true, depth: 2 }),
    line('B6', 'Fixed Assets', { parent: 'B1', section: 'Assets', isSection: true, depth: 1 }),
    line('B7', 'Equipment', { parent: 'B6', section: 'Assets', current: 1_200_000, prior: 1_200_000, depth: 2 }),
    line('B8', 'Total Fixed Assets', { parent: 'B6', section: 'Assets', current: 1_200_000, prior: 1_200_000, isTotal: true, depth: 2 }),
    line('B9', 'Total Assets', { parent: 'B1', section: 'Assets', current: 2_000_000, prior: 1_800_000, isTotal: true, depth: 1 }),
    line('B10', 'Liabilities and Equity', { section: 'Liabilities and Equity', isSection: true, page: 2 }),
    line('B11', 'Liabilities', { parent: 'B10', section: 'Liabilities and Equity', isSection: true, depth: 1, page: 2 }),
    line('B12', 'Current Liabilities', { parent: 'B11', section: 'Liabilities and Equity', isSection: true, depth: 2, page: 2 }),
    line('B13', 'Accounts Payable', { parent: 'B12', section: 'Liabilities and Equity', current: 200_000, prior: 100_000, depth: 3, page: 2 }),
    line('B14', 'Total Current Liabilities', { parent: 'B12', section: 'Liabilities and Equity', current: 200_000, prior: 100_000, isTotal: true, depth: 3, page: 2 }),
    line('B15', 'Long-Term Liabilities', { parent: 'B11', section: 'Liabilities and Equity', isSection: true, depth: 2, page: 2 }),
    line('B16', 'Bank Loan', { parent: 'B15', section: 'Liabilities and Equity', current: 600_000, prior: 700_000, depth: 3, page: 2 }),
    line('B17', 'Total Long-Term Liabilities', { parent: 'B15', section: 'Liabilities and Equity', current: 600_000, prior: 700_000, isTotal: true, depth: 3, page: 2 }),
    line('B18', 'Total Liabilities', { parent: 'B11', section: 'Liabilities and Equity', current: 800_000, prior: 800_000, isTotal: true, depth: 2, page: 2 }),
    line('B19', 'Equity', { parent: 'B10', section: 'Liabilities and Equity', isSection: true, depth: 1, page: 2 }),
    line('B20', "Owner's Equity", { parent: 'B19', section: 'Liabilities and Equity', current: 1_200_000, prior: 1_000_000, depth: 2, page: 2 }),
    line('B21', 'Total Equity', { parent: 'B19', section: 'Liabilities and Equity', current: 1_200_000, prior: 1_000_000, isTotal: true, depth: 2, page: 2 }),
    line('B22', 'Total Liabilities and Equity', { parent: 'B10', section: 'Liabilities and Equity', current: 2_000_000, prior: 1_800_000, isTotal: true, depth: 1, page: 2 }),
  ];
}

export function balanceReport(overrides: Partial<ReportRow> = {}): ReportRow {
  return report({
    id: 'report-2',
    reportType: 'balance_sheet',
    periodStart: '2026-06-30',
    periodEnd: '2026-06-30',
    comparativeStart: '2025-06-30',
    comparativeEnd: '2025-06-30',
    ...overrides,
  });
}

/** Drop the comparative column entirely. */
export function withoutPrior(rows: LineRow[]): LineRow[] {
  return rows.map((row) => ({ ...row, priorCents: null }));
}

export function amend(rows: LineRow[], id: string, patch: Partial<LineRow>): LineRow[] {
  return rows.map((row) => (row.id === id ? { ...row, ...patch } : row));
}

export function without(rows: LineRow[], ...ids: string[]): LineRow[] {
  return rows.filter((row) => !ids.includes(row.id));
}
