'use client';

// Client state for one Nick conversation: optimistic user message, streamed
// answer, tool status, errors, and the persisted messages once the server
// confirms them. The route is the only mutation path; this hook never writes
// tenant data itself.
import { useCallback, useRef, useState } from 'react';

import type { CitationRecord, NickErrorCode, NickEvent, PageContext, PendingAction, ThreadMessage } from '@/lib/ai/nick/types';

import { readSse } from './sse';

export type ChatMessage =
  | { id: string; role: 'user'; text: string; failed?: boolean }
  | { id: string; role: 'assistant'; text: string; citations: CitationRecord[]; pendingAction: PendingAction | null };

export type NickChatState = {
  sessionId: string | null;
  messages: ChatMessage[];
  streaming: boolean;
  streamText: string;
  status: string | null;
  error: NickErrorCode | null;
};

export type NickChat = NickChatState & {
  send: (text: string, context?: PageContext) => Promise<void>;
  retry: () => Promise<void>;
  reset: () => void;
};

export function fromThread(thread: readonly ThreadMessage[]): ChatMessage[] {
  return thread.map((m) =>
    m.role === 'user' ? { id: m.id, role: 'user', text: m.text } : { id: m.id, role: 'assistant', text: m.text, citations: m.citations, pendingAction: m.pendingAction },
  );
}

export function useNickChat(options: { sessionId: string | null; initialMessages: ChatMessage[]; locale: 'en' | 'es'; onSession?: (sessionId: string, firstMessage: string) => void }): NickChat {
  const [state, setState] = useState<NickChatState>({
    sessionId: options.sessionId,
    messages: options.initialMessages,
    streaming: false,
    streamText: '',
    status: null,
    error: null,
  });
  const lastSend = useRef<{ text: string; context?: PageContext } | null>(null);
  const onSession = options.onSession;

  const send = useCallback(
    async (text: string, context?: PageContext) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      lastSend.current = context ? { text: trimmed, context } : { text: trimmed };
      const localId = `local-${Date.now()}`;
      let sessionId = state.sessionId;
      let isFirst = false;
      setState((s) => {
        sessionId = s.sessionId;
        isFirst = s.messages.length === 0;
        return { ...s, messages: [...s.messages.filter((m) => !(m.role === 'user' && m.failed)), { id: localId, role: 'user', text: trimmed }], streaming: true, streamText: '', status: null, error: null };
      });

      const apply = (event: NickEvent) => {
        switch (event.type) {
          case 'session':
            setState((s) => ({ ...s, sessionId: event.sessionId }));
            if (isFirst) onSession?.(event.sessionId, trimmed);
            break;
          case 'status':
            setState((s) => ({ ...s, status: event.tool }));
            break;
          case 'delta':
            setState((s) => ({ ...s, status: null, streamText: s.streamText + event.text }));
            break;
          case 'reset':
            setState((s) => ({ ...s, streamText: '' }));
            break;
          case 'done':
            setState((s) => ({
              ...s,
              streaming: false,
              streamText: '',
              status: null,
              messages: [...s.messages, { id: event.messageId, role: 'assistant', text: event.text, citations: event.citations, pendingAction: event.pendingAction }],
            }));
            break;
          case 'error':
            setState((s) => ({
              ...s,
              streaming: false,
              streamText: '',
              status: null,
              error: event.code,
              messages: s.messages.map((m) => (m.id === localId && m.role === 'user' ? { ...m, failed: true } : m)),
            }));
            break;
        }
      };

      try {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...(sessionId ? { sessionId } : {}), message: trimmed, locale: options.locale, ...(context ? { context } : {}) }),
        });
        if (!response.ok || !response.body) {
          const code: NickErrorCode = response.status === 401 ? 'unauthorized' : response.status === 404 ? 'no_entity' : response.status === 400 ? 'invalid_request' : 'model_error';
          apply({ type: 'error', code });
          return;
        }
        await readSse(response.body, apply);
        setState((s) => (s.streaming ? { ...s, streaming: false, streamText: '', status: null, error: s.error ?? 'model_error' } : s));
      } catch {
        apply({ type: 'error', code: 'model_error' });
      }
    },
    [options.locale, onSession, state.sessionId],
  );

  const retry = useCallback(async () => {
    const last = lastSend.current;
    if (last) await send(last.text, last.context);
  }, [send]);

  const reset = useCallback(() => {
    lastSend.current = null;
    setState({ sessionId: null, messages: [], streaming: false, streamText: '', status: null, error: null });
  }, []);

  return { ...state, send, retry, reset };
}
