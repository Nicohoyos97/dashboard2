// Minimal Server-Sent Events reader for the chat stream. Pure and
// framework-free so the parser is unit-tested; the hook feeds it chunks.
import type { NickEvent } from '@/lib/ai/nick/types';

const EVENT_TYPES = new Set<NickEvent['type']>([
  'session',
  'status',
  'delta',
  'reset',
  'done',
  'error',
]);

function isNickEvent(value: unknown): value is NickEvent {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    EVENT_TYPES.has((value as { type: NickEvent['type'] }).type)
  );
}

/** Parses one `event:`/`data:` block; unknown or malformed blocks yield null. */
export function parseSseBlock(block: string): NickEvent | null {
  let data = '';
  for (const line of block.split('\n')) {
    if (line.startsWith('data:')) data += line.slice(5).trim();
  }
  if (!data) return null;
  try {
    const parsed: unknown = JSON.parse(data);
    return isNickEvent(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Splits a growing buffer into complete blocks; returns the events and the unread remainder. */
export function drainSse(buffer: string): { events: NickEvent[]; rest: string } {
  const normalized = buffer.replace(/\r\n/g, '\n');
  const parts = normalized.split('\n\n');
  const rest = parts.pop() ?? '';
  const events = parts.flatMap((part) => {
    const event = parseSseBlock(part);
    return event ? [event] : [];
  });
  return { events, rest };
}

export async function readSse(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: NickEvent) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const drained = drainSse(buffer);
    buffer = drained.rest;
    for (const event of drained.events) onEvent(event);
  }
  const tail = parseSseBlock(buffer);
  if (tail) onEvent(tail);
}
