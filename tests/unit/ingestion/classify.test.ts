// @vitest-environment node
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { CLASSIFY_BATCH_SIZE, classifyPages } from '@/lib/ingestion/classify';
import type { PdfPage } from '@/lib/ingestion/classify';
import { splitPages } from '@/lib/ingestion/pdf';

import {
  classifyAllAs,
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

let pages: PdfPage[] = [];
const expected = readExpected('letter-and-pnl.classification.json');
const expectedPages = isRecord(expected) ? expected.pages : null;

beforeAll(async () => {
  server.listen({ onUnhandledRequest: 'error' });
  pages = (await splitPages(readFixture('letter-and-pnl.pdf'))).map((pdf, index) => ({ page: index + 1, pdf }));
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function userContent(body: JsonRecord): JsonRecord[] {
  const first = Array.isArray(body.messages) ? body.messages[0] : null;
  const content = isRecord(first) && Array.isArray(first.content) ? first.content : [];
  return content.filter(isRecord);
}

async function expectCode(promise: Promise<unknown>, code: string): Promise<void> {
  await expect(promise).rejects.toMatchObject({ name: 'IngestionError', code });
}

describe('classifyPages', () => {
  it('sends every page as its own base64 document block and returns the validated classification', async () => {
    const captured = mockMessages([messageJson(expected)]);
    const result = await classifyPages({ pages, anthropic: testClient(), model: 'fast-override' });
    expect(result.pages).toEqual(expectedPages);
    expect(result.usage).toEqual({ inputTokens: 120, outputTokens: 40 });

    const body = must(captured[0]);
    expect(body.model).toBe('fast-override');
    expect(body.max_tokens).toBe(8000);
    expect(body).not.toHaveProperty('thinking');
    const outputConfig = must(isRecord(body.output_config) ? body.output_config : null, 'output_config');
    expect(outputConfig.effort).toBe('low');
    const format = must(isRecord(outputConfig.format) ? outputConfig.format : null, 'format');
    expect(format.type).toBe('json_schema');
    expect(isRecord(format.schema) ? format.schema.additionalProperties : null).toBe(false);
    expect(String(body.system)).toContain('untrusted');

    expect(documentPagesOf(body)).toEqual([1, 2, 3]);
    const content = userContent(body);
    expect(content).toHaveLength(4);
    for (const block of content.slice(0, 3)) {
      const source = must(isRecord(block.source) ? block.source : null, 'source');
      expect(source.type).toBe('base64');
      expect(source.media_type).toBe('application/pdf');
      const data = String(source.data);
      expect(data).not.toMatch(/[\r\n]/);
      expect(Buffer.from(data, 'base64').toString('latin1', 0, 5)).toBe('%PDF-');
    }
    expect(must(content[3]).type).toBe('text');
    expect(String(must(content[3]).text)).toContain('Page 1, Page 2, Page 3');
  });

  it('uses the configured fast model by default', async () => {
    const captured = mockMessages([messageJson(expected)]);
    await classifyPages({ pages, anthropic: testClient() });
    expect(must(captured[0]).model).toBe('fast-test-model');
  });

  it('batches at most 20 pages per request and merges the results in page order', async () => {
    const many: PdfPage[] = Array.from({ length: 45 }, (_, index) => ({ page: index + 1, pdf: must(pages[0]).pdf }));
    const captured = mockMessages(classifyAllAs('other'));
    const result = await classifyPages({ pages: many, anthropic: testClient() });
    expect(captured).toHaveLength(3);
    expect(captured.map((body) => documentPagesOf(body).length)).toEqual([CLASSIFY_BATCH_SIZE, CLASSIFY_BATCH_SIZE, 5]);
    expect(result.pages.map((page) => page.page)).toEqual(many.map((page) => page.page));
    expect(result.usage).toEqual({ inputTokens: 360, outputTokens: 120 });
  });

  it('rejects a page number that was not in the request', async () => {
    mockMessages([messageJson({ pages: [{ page: 1, kind: 'other', confidence: 1 }, { page: 2, kind: 'other', confidence: 1 }, { page: 99, kind: 'other', confidence: 1 }] })]);
    await expectCode(classifyPages({ pages, anthropic: testClient() }), 'page_out_of_range');
  });

  it('rejects a response that skips or repeats a page', async () => {
    mockMessages([messageJson({ pages: [{ page: 1, kind: 'other', confidence: 1 }, { page: 2, kind: 'other', confidence: 1 }] })]);
    await expectCode(classifyPages({ pages, anthropic: testClient() }), 'schema_invalid');
    mockMessages([messageJson({ pages: [1, 2, 2].map((page) => ({ page, kind: 'other', confidence: 1 })) })]);
    await expectCode(classifyPages({ pages, anthropic: testClient() }), 'schema_invalid');
  });

  it('maps a refusal to model_refusal', async () => {
    mockMessages([refusalJson()]);
    await expect(classifyPages({ pages, anthropic: testClient() })).rejects.toMatchObject({ code: 'model_refusal', detail: 'cyber' });
  });

  it('maps a max_tokens stop to extraction_truncated', async () => {
    mockMessages([truncatedJson()]);
    await expectCode(classifyPages({ pages, anthropic: testClient() }), 'extraction_truncated');
  });

  it('rejects non-JSON text and schema deviations without echoing content', async () => {
    mockMessages([messageJson(null, { content: [{ type: 'text', text: 'Total Income 227,550.50' }] })]);
    await expect(classifyPages({ pages, anthropic: testClient() })).rejects.toSatisfy(
      (error: unknown) => isRecord(error) && error.code === 'schema_invalid' && !String(error.message).includes('227'),
    );
    mockMessages([messageJson({ pages: [1, 2, 3].map((page) => ({ page, kind: 'letter', confidence: 1 })) })]);
    await expect(classifyPages({ pages, anthropic: testClient() })).rejects.toMatchObject({
      code: 'schema_invalid',
      detail: expect.stringContaining('pages.0.kind'),
    });
  });

  it('rejects an empty page list before making a request', async () => {
    await expect(classifyPages({ pages: [], anthropic: testClient() })).rejects.toThrow(TypeError);
  });
});
