// @vitest-environment node
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { runPdfPipeline } from '@/lib/ingestion/pipeline';

import {
  documentPagesOf,
  isRecord,
  messageJson,
  mockMessages,
  must,
  readExpected,
  readFixture,
  refusalJson,
  server,
  testClient,
} from './helpers/anthropic-mock';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const classificationOf = (name: string) => readExpected(`${name}.classification.json`);

/** The fixture classification with report_type removed from every page (the classifier could not tell). */
function untyped(name: string): unknown {
  const copy: unknown = structuredClone(classificationOf(name));
  if (isRecord(copy) && Array.isArray(copy.pages)) {
    for (const page of copy.pages) if (isRecord(page)) delete page.report_type;
  }
  return copy;
}

describe('runPdfPipeline', () => {
  it('classifies, extracts only the statement pages, builds the hierarchy and reconciles a letter + P&L', async () => {
    const captured = mockMessages([messageJson(classificationOf('letter-and-pnl')), messageJson(readExpected('letter-and-pnl.json'))]);
    const output = await runPdfPipeline({
      pdf: readFixture('letter-and-pnl.pdf'),
      anthropic: testClient(),
      models: { fast: 'fast-x', reasoning: 'reasoning-x' },
    });

    expect(output.pageCount).toBe(3);
    expect(output.pages.map((page) => page.kind)).toEqual(['firm_letter', 'financial_statement', 'financial_statement']);
    expect(output.warnings).toEqual([]);
    expect(output.usage).toEqual({ inputTokens: 240, outputTokens: 80 });

    const result = must(output.results[0]);
    expect(output.results).toHaveLength(1);
    expect(result.kind).toBe('financial_statement');
    if (result.kind !== 'financial_statement') return;
    expect(result.pages).toEqual([2, 3]);
    expect(result.hierarchy.rows).toHaveLength(21);
    expect(result.reconciliation.passed).toBe(true);
    expect(result.data.report_type).toBe('profit_and_loss');

    expect(captured).toHaveLength(2);
    expect(documentPagesOf(must(captured[0]))).toEqual([1, 2, 3]);
    expect(must(captured[0]).model).toBe('fast-x');
    expect(documentPagesOf(must(captured[1]))).toEqual([2, 3]);
    expect(must(captured[1]).model).toBe('reasoning-x');
  });

  it('reconciles a bank statement', async () => {
    mockMessages([messageJson(classificationOf('bank-statement')), messageJson(readExpected('bank-statement.json'))]);
    const output = await runPdfPipeline({ pdf: readFixture('bank-statement.pdf'), anthropic: testClient() });
    const result = must(output.results[0]);
    expect(result.kind).toBe('bank_activity');
    expect(result.pages).toEqual([1, 2]);
    expect(result.reconciliation.passed).toBe(true);
    expect(result.reconciliation.checks.map((c) => c.key)).toEqual(['ending_balance', 'running_balance']);
  });

  it('flags an unbalanced balance sheet instead of passing it', async () => {
    mockMessages([messageJson(classificationOf('balance-sheet-unbalanced')), messageJson(readExpected('balance-sheet-unbalanced.json'))]);
    const output = await runPdfPipeline({ pdf: readFixture('balance-sheet-unbalanced.pdf'), anthropic: testClient() });
    const result = must(output.results[0]);
    expect(result.kind).toBe('financial_statement');
    expect(result.reconciliation.passed).toBe(false);
    expect(result.reconciliation.checks.find((c) => c.key === 'balance_equation')?.ok).toBe(false);
  });

  it('extracts and checks a sales tax confirmation', async () => {
    mockMessages([messageJson(classificationOf('sales-tax-confirmation')), messageJson(readExpected('sales-tax-confirmation.json'))]);
    const output = await runPdfPipeline({ pdf: readFixture('sales-tax-confirmation.pdf'), anthropic: testClient() });
    const result = must(output.results[0]);
    expect(result.kind).toBe('tax_record');
    expect(result.reconciliation.passed).toBe(true);
    expect(result.reconciliation.checks.map((c) => c.key)).toEqual(['sales_tax_payable']);
  });

  it('uses expectedType only to settle pages the classifier left ambiguous', async () => {
    const captured = mockMessages([messageJson(untyped('letter-and-pnl')), messageJson(readExpected('letter-and-pnl.json'))]);
    const output = await runPdfPipeline({ pdf: readFixture('letter-and-pnl.pdf'), anthropic: testClient(), expectedType: 'profit_and_loss' });
    expect(captured).toHaveLength(2);
    expect(output.results.map((r) => r.kind)).toEqual(['financial_statement']);
    expect(output.warnings).toEqual([]);
  });

  it('skips unresolved statement pages when no expectedType is given', async () => {
    const captured = mockMessages([messageJson(untyped('letter-and-pnl'))]);
    const output = await runPdfPipeline({ pdf: readFixture('letter-and-pnl.pdf'), anthropic: testClient() });
    expect(captured).toHaveLength(1);
    expect(output.results).toEqual([]);
    expect(output.warnings).toEqual([
      'page 2: report type unresolved, not extracted',
      'page 3: report type unresolved, not extracted',
      'no financial statement pages found',
    ]);
  });

  it('keeps a confident classification that disagrees with expectedType, with a warning', async () => {
    mockMessages([messageJson(classificationOf('letter-and-pnl')), messageJson(readExpected('letter-and-pnl.json'))]);
    const output = await runPdfPipeline({ pdf: readFixture('letter-and-pnl.pdf'), anthropic: testClient(), expectedType: 'balance_sheet' });
    expect(output.results.map((r) => r.kind)).toEqual(['financial_statement']);
    expect(output.warnings).toEqual([
      'page 2: classified as profit_and_loss, expected balance_sheet',
      'page 3: classified as profit_and_loss, expected balance_sheet',
    ]);
  });

  it('rejects a non-PDF before any request is made', async () => {
    const captured = mockMessages([messageJson({})]);
    await expect(runPdfPipeline({ pdf: Buffer.from('not a pdf'), anthropic: testClient() })).rejects.toMatchObject({ code: 'pdf_invalid' });
    expect(captured).toHaveLength(0);
  });

  it('propagates a refusal during extraction', async () => {
    mockMessages([messageJson(classificationOf('letter-and-pnl')), refusalJson()]);
    await expect(runPdfPipeline({ pdf: readFixture('letter-and-pnl.pdf'), anthropic: testClient() })).rejects.toMatchObject({ code: 'model_refusal' });
  });
});
