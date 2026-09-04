// @vitest-environment node
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { CitationRegistry } from '@/lib/ai/nick/citations';
import { runToolLoop } from '@/lib/ai/nick/loop';
import { CITATION_RETRY_MESSAGE, NICK_SYSTEM_PROMPT } from '@/lib/ai/nick/prompts';
import { toolDefinitions } from '@/lib/ai/nick/tools/schemas';
import { PACKAGE_MODULES } from '@/lib/portal/modules';
import { NickError, type NickEvent } from '@/lib/ai/nick/types';

import { isRecord, server, testClient } from '../ingestion/helpers/anthropic-mock';
import { mockStreams } from './helpers/stream-mock';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const PNL_CALL = {
  id: 'toolu_1',
  name: 'get_profit_and_loss',
  input: { period: null, detail: 'summary', query: null },
};

function harness(maxIterations = 8) {
  const registry = new CitationRegistry();
  const events: NickEvent[] = [];
  const toolInputs: unknown[] = [];
  const runTool = async (name: string, input: unknown) => {
    toolInputs.push({ name, input });
    if (name !== 'get_profit_and_loss') return { ok: false, result: { error: 'unknown_tool' } };
    const cite = registry.add({
      label: 'Profit & Loss · Q2 2026 · Page 2 · Net Income',
      reportId: 'r1',
      documentVersionId: 'v1',
      lineId: 'l9',
      page: 2,
      periodStart: '2026-04-01',
      periodEnd: '2026-06-30',
      source: 'firm_document',
      href: '/statements/profit-and-loss?period=2026-04-01_2026-06-30',
    });
    return {
      ok: true,
      result: {
        available: true,
        netIncome: { current: { amount: '12450.00', formatted: '$12,450.00', cite } },
      },
    };
  };
  const run = () =>
    runToolLoop({
      anthropic: testClient(),
      model: 'reasoning-test-model',
      maxTokens: 800,
      effort: 'high',
      system: [{ type: 'text', text: NICK_SYSTEM_PROMPT }],
      tools: toolDefinitions(PACKAGE_MODULES.full),
      messages: [{ role: 'user', content: 'What was net income?' }],
      runTool,
      registry,
      emit: (event) => events.push(event),
      maxIterations,
    });
  return { registry, events, toolInputs, run };
}

function lastUserText(body: unknown): string {
  const messages = isRecord(body) && Array.isArray(body.messages) ? body.messages : [];
  const last = messages.at(-1);
  return isRecord(last) ? JSON.stringify(last.content) : '';
}

describe('runToolLoop', () => {
  it('executes a tool call, feeds the result back, and returns a cited answer with its citations', async () => {
    const captured = mockStreams([
      { text: 'Let me check.', toolUses: [PNL_CALL] },
      { text: 'Net income was **$12,450.00** [c1] for the quarter.' },
    ]);
    const h = harness();
    const outcome = await h.run();

    expect(outcome.text).toBe('Net income was **$12,450.00** [c1] for the quarter.');
    expect(outcome.citations.map((c) => c.key)).toEqual(['c1']);
    expect(outcome.toolCalls).toEqual([{ name: 'get_profit_and_loss', ok: true }]);
    expect(outcome.retried).toBe(false);
    expect(outcome.usage.input).toBe(200);
    expect(h.toolInputs).toEqual([{ name: 'get_profit_and_loss', input: PNL_CALL.input }]);

    // The second request carries the assistant tool_use turn and our tool_result.
    expect(captured).toHaveLength(2);
    expect(lastUserText(captured[1])).toContain('"tool_use_id":"toolu_1"');
    expect(lastUserText(captured[1])).toContain('$12,450.00');
    const first = captured[0];
    expect(isRecord(first) && Array.isArray(first.tools) ? first.tools.length : 0).toBe(11);
    expect(isRecord(first) && first.stream).toBe(true);

    // Events: interim text streamed, cleared when the tool runs, status, then the answer.
    const types = h.events.map((e) => e.type);
    expect(types.slice(0, 2)).toEqual(['delta', 'delta']);
    expect(types).toContain('reset');
    expect(types).toContain('status');
    expect(
      h.events
        .filter((e) => e.type === 'delta')
        .map((e) => (e.type === 'delta' ? e.text : ''))
        .join(''),
    ).toContain('Net income was');
  });

  it('retries once with a corrective message when a figure has no citation', async () => {
    const captured = mockStreams([
      { toolUses: [PNL_CALL] },
      { text: 'Net income was $12,450.00.' },
      { text: 'Net income was $12,450.00 [c1].' },
    ]);
    const h = harness();
    const outcome = await h.run();
    expect(outcome.retried).toBe(true);
    expect(outcome.text).toBe('Net income was $12,450.00 [c1].');
    expect(captured).toHaveLength(3);
    expect(lastUserText(captured[2])).toContain(CITATION_RETRY_MESSAGE.slice(0, 40));
    expect(h.events.filter((e) => e.type === 'reset')).toHaveLength(2);
  });

  it('rejects the turn when the corrected answer is still uncited', async () => {
    mockStreams([
      { toolUses: [PNL_CALL] },
      { text: 'Net income was $12,450.00.' },
      { text: 'It was $12,450.00, trust me.' },
    ]);
    await expect(harness().run()).rejects.toMatchObject({
      code: 'uncited_answer',
    } satisfies Partial<NickError>);
  });

  it('rejects a marker the tools never issued', async () => {
    mockStreams([
      { text: 'Revenue was $80,000.00 [c7].' },
      { text: 'Revenue was $80,000.00 [c7].' },
    ]);
    await expect(harness().run()).rejects.toMatchObject({ code: 'uncited_answer' });
  });

  it('surfaces a refusal as its own error', async () => {
    mockStreams([{ stopReason: 'refusal' }]);
    await expect(harness().run()).rejects.toMatchObject({ code: 'refusal' });
  });

  it('forces an answer on the final allowed iteration instead of calling tools forever', async () => {
    const captured = mockStreams((_body, index) =>
      index === 0 ? { toolUses: [PNL_CALL] } : { text: 'Net income was $12,450.00 [c1].' },
    );
    const outcome = await harness(2).run();
    expect(outcome.text).toContain('[c1]');
    expect(captured).toHaveLength(2);
    expect(
      isRecord(captured[1]) && isRecord(captured[1].tool_choice)
        ? captured[1].tool_choice.type
        : null,
    ).toBe('none');
    expect(captured[0]).not.toHaveProperty('tool_choice');
  });

  it('answers small talk without tools and without citations', async () => {
    mockStreams([{ text: 'Hello! Ask me about your statements whenever you like.' }]);
    const outcome = await harness().run();
    expect(outcome.citations).toEqual([]);
    expect(outcome.toolCalls).toEqual([]);
  });
});
