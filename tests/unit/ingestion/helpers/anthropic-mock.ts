// msw interception of the Messages API for the ingestion tests, mocked at the
// network layer (docs/CODE_STYLE.md). Canned responses follow the shape the
// SDK expects for structured output: one text block holding the JSON.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import Anthropic from '@anthropic-ai/sdk';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';

export const MESSAGES_URL = 'https://api.anthropic.com/v1/messages';
export const server = setupServer();

// Mocked tests must not pick up real model IDs from the shell; the live test keeps them.
if (process.env.ANTHROPIC_LIVE_TESTS !== '1') {
  process.env.ANTHROPIC_FAST_MODEL = 'fast-test-model';
  process.env.ANTHROPIC_REASONING_MODEL = 'reasoning-test-model';
}

export type JsonRecord = Record<string, unknown>;

export function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function must<T>(value: T | undefined | null, what = 'value'): T {
  if (value === undefined || value === null) throw new Error(`expected ${what}`);
  return value;
}

export function testClient(): Anthropic {
  return new Anthropic({ apiKey: 'test-key', maxRetries: 0 });
}

export function readFixture(name: string): Buffer {
  return readFileSync(fileURLToPath(new URL(`../../../fixtures/${name}`, import.meta.url)));
}

export function readExpected(name: string): unknown {
  return JSON.parse(readFixture(`expected/${name}`).toString('utf8'));
}

export function messageJson(payload: unknown, overrides: JsonRecord = {}): JsonRecord {
  return {
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    model: 'test-model',
    content: [{ type: 'text', text: JSON.stringify(payload) }],
    stop_reason: 'end_turn',
    stop_sequence: null,
    stop_details: null,
    usage: {
      input_tokens: 120,
      output_tokens: 40,
      cache_creation_input_tokens: null,
      cache_read_input_tokens: null,
      cache_creation: null,
      server_tool_use: null,
      service_tier: null,
      inference_geo: null,
      output_tokens_details: null,
    },
    ...overrides,
  };
}

export function refusalJson(): JsonRecord {
  return messageJson(null, {
    content: [],
    stop_reason: 'refusal',
    stop_details: { type: 'refusal', category: 'cyber', explanation: 'test refusal' },
  });
}

export function truncatedJson(): JsonRecord {
  return messageJson(null, {
    content: [{ type: 'text', text: '{"pages":[{"page":1,"kind":"financial_state' }],
    stop_reason: 'max_tokens',
  });
}

export type Responder = (body: JsonRecord, index: number, headers: Headers) => JsonRecord;

/** Answers each POST /v1/messages from the responder (or the list, last one repeating); returns captured bodies. */
export function mockMessages(responses: JsonRecord[] | Responder): JsonRecord[] {
  const captured: JsonRecord[] = [];
  server.use(
    http.post(MESSAGES_URL, async ({ request }) => {
      const body: unknown = await request.json();
      if (!isRecord(body)) throw new Error('non-object request body');
      const index = captured.length;
      captured.push(body);
      const response =
        typeof responses === 'function'
          ? responses(body, index, request.headers)
          : must(responses[Math.min(index, responses.length - 1)], 'canned response');
      return HttpResponse.json(response);
    }),
  );
  return captured;
}

/** The "Page N" titles of the document blocks in a captured request, in order. */
export function documentPagesOf(body: JsonRecord): number[] {
  const messages = body.messages;
  const first = Array.isArray(messages) ? messages[0] : undefined;
  const content = isRecord(first) && Array.isArray(first.content) ? first.content : [];
  return content.flatMap((block: unknown) => {
    if (!isRecord(block) || block.type !== 'document' || typeof block.title !== 'string') return [];
    return [Number(block.title.replace('Page ', ''))];
  });
}

/** A classification answer that labels every page in the request the same way. */
export function classifyAllAs(kind: string, reportType?: string): Responder {
  return (body) =>
    messageJson({
      pages: documentPagesOf(body).map((page) => ({
        page,
        kind,
        ...(reportType ? { report_type: reportType } : {}),
        confidence: 0.97,
      })),
    });
}
