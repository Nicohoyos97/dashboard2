// Nick's streaming endpoint (docs/PLAN.md §3.7): a route handler because
// Server Actions cannot stream. It performs no mutation on the client's behalf
// other than persisting the conversation itself. The business comes from the
// verified session; the body only carries the message and a page pointer that
// the server re-derives from published rows. Not localized.
import { z } from 'zod';

import { runNickTurn } from '@/lib/ai/nick/chat';
import { NICK_LIMITS } from '@/lib/ai/nick/config';
import { NickError, type NickEvent, pageContextSchema } from '@/lib/ai/nick/types';
import { getCurrentEntity } from '@/lib/auth/getCurrentEntity';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/** A turn's model calls stop here, leaving room inside maxDuration to save what was spent. */
const TURN_DEADLINE_MS = 110_000;

const bodySchema = z.object({
  sessionId: z.string().uuid().optional(),
  message: z.string().trim().min(1).max(NICK_LIMITS.maxMessageChars),
  locale: z.enum(['en', 'es']).default('en'),
  context: pageContextSchema.optional(),
});

function encode(event: NickEvent): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

export async function POST(request: Request) {
  const [user, entity] = await Promise.all([getCurrentUser(), getCurrentEntity()]);
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!entity) return Response.json({ error: 'no_entity' }, { status: 404 });

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return Response.json({ error: 'invalid_request' }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return Response.json({ error: 'invalid_request' }, { status: 400 });
  const body = parsed.data;

  const encoder = new TextEncoder();
  // The model stops when the reader leaves (the request is aborted, or the
  // stream cancelled) or the turn runs out of time inside maxDuration — every
  // token after that would be paid for and never read.
  const gone = new AbortController();
  request.signal.addEventListener('abort', () => gone.abort(), { once: true });
  const signal = AbortSignal.any([gone.signal, AbortSignal.timeout(TURN_DEADLINE_MS)]);
  let closed = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      // Once the stream is closed nothing more can be written to it; writing
      // anyway threw, and the error path then tried to write the error.
      const emit = (event: NickEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(encode(event)));
        } catch {
          closed = true;
        }
      };
      runNickTurn({
        userId: user.id,
        entity,
        locale: body.locale,
        sessionId: body.sessionId ?? null,
        message: body.message,
        context: body.context,
        emit,
        signal,
      })
        .catch((error: unknown) => {
          if (!(error instanceof NickError))
            console.error('[nick] turn failed:', error instanceof Error ? error.name : 'unknown');
          emit({ type: 'error', code: error instanceof NickError ? error.code : 'model_error' });
        })
        .finally(() => {
          if (closed) return;
          closed = true;
          controller.close();
        });
    },
    cancel() {
      closed = true;
      gone.abort();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
