// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { drainSse, parseSseBlock, readSse } from '@/components/chat/sse';
import type { NickEvent } from '@/lib/ai/nick/types';

describe('parseSseBlock', () => {
  it('reads the data line of a Nick event', () => {
    expect(parseSseBlock('event: delta\ndata: {"type":"delta","text":"Hi"}')).toEqual({ type: 'delta', text: 'Hi' });
  });

  it('ignores malformed and foreign events', () => {
    expect(parseSseBlock('data: not json')).toBeNull();
    expect(parseSseBlock('event: ping\ndata: {"type":"ping"}')).toBeNull();
    expect(parseSseBlock(': comment only')).toBeNull();
  });
});

describe('drainSse', () => {
  it('returns complete blocks and keeps the unterminated remainder', () => {
    const { events, rest } = drainSse('event: session\ndata: {"type":"session","sessionId":"s1"}\n\nevent: delta\ndata: {"type":"delta","te');
    expect(events).toEqual([{ type: 'session', sessionId: 's1' }]);
    expect(rest).toBe('event: delta\ndata: {"type":"delta","te');
  });
});

describe('readSse', () => {
  it('emits events across chunk boundaries and flushes a final block without a trailing blank line', async () => {
    const encoder = new TextEncoder();
    const chunks = ['event: delta\ndata: {"type":"delta","text":"Net "}\n\nevent: delta\ndata: {"type":"del', 'ta","text":"income"}\n\nevent: done\ndata: {"type":"done","messageId":"m1","text":"Net income","citations":[],"pendingAction":null}'];
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
        controller.close();
      },
    });
    const events: NickEvent[] = [];
    await readSse(body, (event) => events.push(event));
    expect(events.map((e) => e.type)).toEqual(['delta', 'delta', 'done']);
  });
});
