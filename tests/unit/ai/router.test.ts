// @vitest-environment node
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { ROUTER_FALLBACK, routeMessage } from '@/lib/ai/nick/router';

import {
  isRecord,
  messageJson,
  mockMessages,
  server,
  testClient,
} from '../ingestion/helpers/anthropic-mock';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const decision = {
  complexity: 'simple',
  tools_likely: ['get_profit_and_loss'],
  confirms_pending_action: true,
};

describe('routeMessage', () => {
  it('sends the message as delimited data with a JSON-schema output format on the fast model', async () => {
    const captured = mockMessages([messageJson(decision)]);
    const result = await routeMessage(testClient(), 'fast-test-model', {
      message: 'What was revenue?',
      pendingActionLabel: null,
    });
    expect(result.complexity).toBe('simple');
    expect(result.tools_likely).toEqual(['get_profit_and_loss']);
    const body = captured[0];
    expect(body?.model).toBe('fast-test-model');
    const output = isRecord(body?.output_config) ? body.output_config : {};
    expect(output.effort).toBe('low');
    expect(isRecord(output.format) && output.format.type).toBe('json_schema');
    const messages = Array.isArray(body?.messages) ? body.messages : [];
    const first = isRecord(messages[0]) ? messages[0] : {};
    expect(String(first.content)).toContain('<user_message>\nWhat was revenue?\n</user_message>');
    expect(String(first.content)).toContain('No pending action.');
  });

  it('never reports a confirmation when nothing is pending, whatever the model says', async () => {
    mockMessages([messageJson(decision)]);
    const result = await routeMessage(testClient(), 'fast-test-model', {
      message: 'yes',
      pendingActionLabel: null,
    });
    expect(result.confirms_pending_action).toBe(false);
  });

  it("passes a pending action through and keeps the model's confirmation", async () => {
    const captured = mockMessages([messageJson(decision)]);
    const result = await routeMessage(testClient(), 'fast-test-model', {
      message: 'yes please',
      pendingActionLabel: 'CSV export — profit-and-loss.csv',
    });
    expect(result.confirms_pending_action).toBe(true);
    const messages = Array.isArray(captured[0]?.messages) ? captured[0].messages : [];
    const first = isRecord(messages[0]) ? messages[0] : {};
    expect(String(first.content)).toContain(
      '<pending_action>CSV export — profit-and-loss.csv</pending_action>',
    );
  });

  it('falls back to the reasoning model with no confirmation on an invalid decision', async () => {
    mockMessages([
      messageJson({ complexity: 'huge', tools_likely: ['rm_rf'], confirms_pending_action: 'yes' }),
    ]);
    expect(
      await routeMessage(testClient(), 'fast-test-model', {
        message: 'x',
        pendingActionLabel: 'y',
      }),
    ).toEqual(ROUTER_FALLBACK);
  });

  it('falls back on non-JSON text and on a truncated reply', async () => {
    mockMessages([messageJson(null, { content: [{ type: 'text', text: 'not json' }] })]);
    expect(
      await routeMessage(testClient(), 'fast-test-model', {
        message: 'x',
        pendingActionLabel: null,
      }),
    ).toEqual(ROUTER_FALLBACK);
    server.resetHandlers();
    mockMessages([messageJson(decision, { stop_reason: 'max_tokens' })]);
    expect(
      await routeMessage(testClient(), 'fast-test-model', {
        message: 'x',
        pendingActionLabel: null,
      }),
    ).toEqual(ROUTER_FALLBACK);
  });
});
