// @vitest-environment node
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import type { PdfPage } from '@/lib/ingestion/classify';
import {
  EXTRACTION_CHUNK_PAGES,
  TAX_RECORD_MAX_PAGES,
  extractBankActivity,
  extractFinancialStatement,
  extractTaxRecord,
} from '@/lib/ingestion/extract';
import { splitPages } from '@/lib/ingestion/pdf';
import { REQUEST_TIMEOUT_MS } from '@/lib/ingestion/request';
import { FinancialStatementSchema } from '@/lib/ingestion/schemas/financial-statement';

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
  truncatedJson,
} from './helpers/anthropic-mock';
import type { JsonRecord } from './helpers/anthropic-mock';

const split = async (name: string): Promise<PdfPage[]> =>
  (await splitPages(readFixture(name))).map((pdf, index) => ({ page: index + 1, pdf }));

const withPage = (fixture: unknown, key: string, page: number): unknown => {
  const copy: unknown = structuredClone(fixture);
  if (!isRecord(copy)) throw new Error('fixture');
  const list = copy[key];
  const first = Array.isArray(list) ? list[0] : null;
  if (isRecord(first)) first.page = page;
  else copy[key] = page;
  return copy;
};

/** The fixture with every line / transaction placed on `page` — what a correct model answers for a chunk starting there. */
const onPage = (fixture: unknown, key: string, page: number): unknown => {
  const copy: unknown = structuredClone(fixture);
  if (!isRecord(copy) || !Array.isArray(copy[key])) throw new Error('fixture');
  for (const item of copy[key]) if (isRecord(item)) item.page = page;
  return copy;
};

const repeatPage = (source: PdfPage, count: number): PdfPage[] =>
  Array.from({ length: count }, (_, index) => ({ page: index + 1, pdf: source.pdf }));

let statementPages: PdfPage[] = [];
let bankPages: PdfPage[] = [];
let taxPages: PdfPage[] = [];
const pnl = readExpected('letter-and-pnl.json');
const bank = readExpected('bank-statement.json');
const tax = readExpected('sales-tax-confirmation.json');

beforeAll(async () => {
  server.listen({ onUnhandledRequest: 'error' });
  statementPages = (await split('letter-and-pnl.pdf')).slice(1);
  bankPages = await split('bank-statement.pdf');
  taxPages = await split('sales-tax-confirmation.pdf');
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

async function expectCode(promise: Promise<unknown>, code: string): Promise<void> {
  await expect(promise).rejects.toMatchObject({ name: 'IngestionError', code });
}

function outputConfig(body: JsonRecord): JsonRecord {
  return must(isRecord(body.output_config) ? body.output_config : null, 'output_config');
}

describe('extractFinancialStatement', () => {
  it('sends only the given pages to the reasoning model and returns the validated statement', async () => {
    const seen: string[] = [];
    const captured = mockMessages((_body, _index, headers) => {
      seen.push(headers.get('x-stainless-timeout') ?? '');
      return messageJson(pnl);
    });
    const result = await extractFinancialStatement({ pages: statementPages, anthropic: testClient() });
    expect(result.data).toEqual(pnl);
    expect(result.usage).toEqual({ inputTokens: 120, outputTokens: 40 });
    const body = must(captured[0]);
    expect(body.model).toBe('reasoning-test-model');
    expect(body.max_tokens).toBe(16000);
    expect(body.stream).toBeUndefined();
    expect(seen).toEqual([String(REQUEST_TIMEOUT_MS / 1000)]);
    expect(body).not.toHaveProperty('thinking');
    expect(outputConfig(body).effort).toBe('high');
    expect(documentPagesOf(body)).toEqual([2, 3]);
    expect(String(body.system)).toContain('Never compute');
  });

  it('honours a model override', async () => {
    const captured = mockMessages([messageJson(pnl)]);
    await extractFinancialStatement({ pages: statementPages, anthropic: testClient(), model: 'reasoning-override' });
    expect(must(captured[0]).model).toBe('reasoning-override');
  });

  it('rejects lines on pages that were not sent', async () => {
    mockMessages([messageJson(withPage(pnl, 'lines', 1))]);
    await expectCode(extractFinancialStatement({ pages: statementPages, anthropic: testClient() }), 'page_out_of_range');
  });

  it('extracts a long statement in chunks of EXTRACTION_CHUNK_PAGES pages and merges the lines with unique refs', async () => {
    const pages = repeatPage(must(statementPages[0]), 25);
    const captured = mockMessages((body) => messageJson(onPage(pnl, 'lines', must(documentPagesOf(body)[0]))));
    const result = await extractFinancialStatement({ pages, anthropic: testClient() });

    expect(captured.map((body) => documentPagesOf(body).length)).toEqual([EXTRACTION_CHUNK_PAGES, EXTRACTION_CHUNK_PAGES, 5]);
    expect(documentPagesOf(must(captured[2]))).toEqual([21, 22, 23, 24, 25]);
    expect(result.usage).toEqual({ inputTokens: 360, outputTokens: 120 });

    const { lines } = result.data;
    expect(lines).toHaveLength(63);
    expect(new Set(lines.map((line) => line.ref)).size).toBe(63);
    expect(lines[21]).toMatchObject({ ref: 'L22', parent_ref: null, account_name: 'Income', page: 11 });
    expect(lines[22]).toMatchObject({ ref: 'L23', parent_ref: 'L22', account_name: 'Sales', page: 11 });
    expect(lines[42]).toMatchObject({ ref: 'L43', parent_ref: null, page: 21 });
    expect(lines[62]).toMatchObject({ ref: 'L63', account_name: 'Net Income' });
    expect(result.data.entity_name).toBe(FinancialStatementSchema.parse(pnl).entity_name);
    expect(FinancialStatementSchema.safeParse(result.data).success).toBe(true);
  });

  it('maps refusal and truncation to their error codes', async () => {
    mockMessages([refusalJson()]);
    await expectCode(extractFinancialStatement({ pages: statementPages, anthropic: testClient() }), 'model_refusal');
    mockMessages([truncatedJson()]);
    await expectCode(extractFinancialStatement({ pages: statementPages, anthropic: testClient() }), 'extraction_truncated');
  });

  it('rejects output that fails the strict schema (float amounts)', async () => {
    const floats: unknown = structuredClone(pnl);
    if (isRecord(floats) && Array.isArray(floats.lines) && isRecord(floats.lines[1])) floats.lines[1].current = 185400;
    mockMessages([messageJson(floats)]);
    await expectCode(extractFinancialStatement({ pages: statementPages, anthropic: testClient() }), 'schema_invalid');
  });
});

describe('extractBankActivity', () => {
  it('returns the validated statement for the pages sent', async () => {
    const captured = mockMessages([messageJson(bank)]);
    const result = await extractBankActivity({ pages: bankPages, anthropic: testClient() });
    expect(result.data).toEqual(bank);
    expect(documentPagesOf(must(captured[0]))).toEqual([1, 2]);
    expect(String(must(captured[0]).system)).toContain('last four digits');
  });

  it('rejects transactions on pages that were not sent', async () => {
    mockMessages([messageJson(withPage(bank, 'transactions', 3))]);
    await expectCode(extractBankActivity({ pages: bankPages, anthropic: testClient() }), 'page_out_of_range');
  });

  it('chunks a long statement, concatenates the transactions and keeps the summary from the first chunk', async () => {
    const pages = repeatPage(must(bankPages[0]), 12);
    const captured = mockMessages((body) => {
      const first = must(documentPagesOf(body)[0]);
      const part = onPage(bank, 'transactions', first);
      return messageJson(first === 1 ? part : { ...(isRecord(part) ? part : {}), ending_balance: '0.00' });
    });
    const result = await extractBankActivity({ pages, anthropic: testClient() });
    expect(captured).toHaveLength(2);
    expect(result.data.transactions).toHaveLength(24);
    expect(result.data.transactions.map((t) => t.page)).toEqual([...Array(12).fill(1), ...Array(12).fill(11)]);
    expect(result.data.ending_balance).toBe('36836.86');
    expect(result.data.masked_account).toBe('****4821');
  });
});

describe('extractTaxRecord', () => {
  it('returns the validated record for the page sent', async () => {
    const captured = mockMessages([messageJson(tax)]);
    const result = await extractTaxRecord({ pages: taxPages, anthropic: testClient() });
    expect(result.data).toEqual(tax);
    expect(documentPagesOf(must(captured[0]))).toEqual([1]);
  });

  it('rejects a record that cites a page that was not sent', async () => {
    mockMessages([messageJson(withPage(tax, 'page', 2))]);
    await expectCode(extractTaxRecord({ pages: taxPages, anthropic: testClient() }), 'page_out_of_range');
  });

  it('never chunks a tax record: more than TAX_RECORD_MAX_PAGES pages is rejected before any request', async () => {
    const captured = mockMessages([messageJson(tax)]);
    const pages = repeatPage(must(taxPages[0]), TAX_RECORD_MAX_PAGES + 1);
    await expectCode(extractTaxRecord({ pages, anthropic: testClient() }), 'pdf_too_many_pages');
    expect(captured).toHaveLength(0);
  });
});
