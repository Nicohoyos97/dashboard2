// msw mock of a *streaming* Messages API response, in the SSE shape the SDK's
// MessageStream parses. Each spec becomes one assistant message: text blocks
// and/or tool_use blocks, then the stop reason.
import { HttpResponse, http } from 'msw';

import { MESSAGES_URL, isRecord, server } from '../../ingestion/helpers/anthropic-mock';
import type { JsonRecord } from '../../ingestion/helpers/anthropic-mock';

export type StreamSpec = {
  text?: string;
  toolUses?: { id: string; name: string; input: Record<string, unknown> }[];
  stopReason?: 'end_turn' | 'tool_use' | 'refusal' | 'max_tokens';
  inputTokens?: number;
  outputTokens?: number;
};

function event(type: string, data: JsonRecord): string {
  return `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`;
}

export function sseFor(spec: StreamSpec): string {
  const stopReason = spec.stopReason ?? (spec.toolUses?.length ? 'tool_use' : 'end_turn');
  let out = event('message_start', {
    message: {
      id: 'msg_stream',
      type: 'message',
      role: 'assistant',
      model: 'test-model',
      content: [],
      stop_reason: null,
      stop_sequence: null,
      usage: { input_tokens: spec.inputTokens ?? 100, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
    },
  });
  let index = 0;
  if (spec.text !== undefined) {
    out += event('content_block_start', { index, content_block: { type: 'text', text: '' } });
    // Split so the loop's delta events are exercised more than once.
    const middle = Math.max(1, Math.floor(spec.text.length / 2));
    for (const piece of [spec.text.slice(0, middle), spec.text.slice(middle)]) {
      if (piece) out += event('content_block_delta', { index, delta: { type: 'text_delta', text: piece } });
    }
    out += event('content_block_stop', { index });
    index += 1;
  }
  for (const use of spec.toolUses ?? []) {
    out += event('content_block_start', { index, content_block: { type: 'tool_use', id: use.id, name: use.name, input: {} } });
    out += event('content_block_delta', { index, delta: { type: 'input_json_delta', partial_json: JSON.stringify(use.input) } });
    out += event('content_block_stop', { index });
    index += 1;
  }
  out += event('message_delta', {
    delta: { stop_reason: stopReason, stop_sequence: null, ...(stopReason === 'refusal' ? { stop_details: { type: 'refusal', category: 'cyber', explanation: 'test' } } : {}) },
    usage: { output_tokens: spec.outputTokens ?? 20 },
  });
  out += event('message_stop', {});
  return out;
}

/** Answers each streamed POST /v1/messages with the next spec (the last one repeats); returns the captured request bodies. */
export function mockStreams(specs: StreamSpec[] | ((body: JsonRecord, index: number) => StreamSpec)): JsonRecord[] {
  const captured: JsonRecord[] = [];
  server.use(
    http.post(MESSAGES_URL, async ({ request }) => {
      const body: unknown = await request.json();
      if (!isRecord(body)) throw new Error('non-object request body');
      const index = captured.length;
      captured.push(body);
      const spec = typeof specs === 'function' ? specs(body, index) : specs[Math.min(index, specs.length - 1)];
      if (!spec) throw new Error('no canned stream');
      return new HttpResponse(sseFor(spec), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
    }),
  );
  return captured;
}
