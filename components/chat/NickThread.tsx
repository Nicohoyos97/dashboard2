'use client';

import { Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef } from 'react';

import type { PageContext } from '@/lib/ai/nick/types';

import { Composer } from './Composer';
import { AssistantText, MessageBubble, SourcesRow } from './MessageBubble';
import { SuggestedQuestions } from './SuggestedQuestions';
import type { NickChat } from './useNickChat';

// The conversation surface shared by the full page and the contextual panel:
// messages, the streaming answer, tool status, errors with retry, suggestions
// when the thread is empty, and the composer.
export function NickThread({
  chat,
  context,
  suggestionKeys,
  businessName,
  autoFocus = false,
}: {
  chat: NickChat;
  context: PageContext | undefined;
  suggestionKeys: readonly string[];
  businessName: string;
  autoFocus?: boolean;
}) {
  const t = useTranslations('Nick');
  const endRef = useRef<HTMLDivElement>(null);
  const send = (text: string) => void chat.send(text, context);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [chat.messages.length, chat.streamText, chat.status]);

  const toolLabel = (tool: string) => {
    const key = `tool_${tool}`;
    return t.has(key) ? t('working', { what: t(key) }) : t('thinking');
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-1 py-4" aria-live="polite" aria-busy={chat.streaming}>
        {chat.messages.length === 0 && !chat.streaming && (
          <div className="mx-auto flex max-w-[560px] flex-col gap-5 py-6">
            <div className="flex items-start gap-3">
              <span className="bg-blue-pale text-blue flex size-10 shrink-0 items-center justify-center rounded-xl">
                <Sparkles className="size-5" aria-hidden="true" />
              </span>
              <div>
                <h2 className="text-ink text-[18px] font-bold">{t('emptyTitle')}</h2>
                <p className="text-muted-foreground mt-1 text-[14px] leading-[1.55]">{t('emptyBody', { business: businessName })}</p>
              </div>
            </div>
            <SuggestedQuestions keys={suggestionKeys} onPick={send} disabled={chat.streaming} />
          </div>
        )}

        <div className="flex flex-col gap-4">
          {chat.messages.map((message) =>
            message.role === 'user' ? (
              <MessageBubble key={message.id} role="user" failed={message.failed ?? false}>
                <p className="whitespace-pre-wrap">{message.text}</p>
              </MessageBubble>
            ) : (
              <MessageBubble key={message.id} role="assistant">
                <AssistantText text={message.text} citations={message.citations} />
                <SourcesRow citations={message.citations} />
              </MessageBubble>
            ),
          )}

          {chat.streaming && (
            <MessageBubble role="assistant">
              {chat.streamText ? (
                <AssistantText text={chat.streamText} citations={[]} />
              ) : (
                <p className="text-muted-foreground flex items-center gap-2 text-[13.5px]">
                  <span className="bg-blue size-2 animate-pulse rounded-full" aria-hidden="true" />
                  {chat.status ? toolLabel(chat.status) : t('thinking')}
                </p>
              )}
            </MessageBubble>
          )}

          {chat.error && (
            <div role="alert" className="border-danger/30 bg-danger/5 text-ink flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 text-[13.5px]">
              <span>{t(`error_${chat.error}`)}</span>
              {chat.error !== 'budget_exhausted' && chat.error !== 'preview_not_supported' && (
                <button type="button" onClick={() => void chat.retry()} className="text-blue font-semibold hover:underline">
                  {t('retry')}
                </button>
              )}
            </div>
          )}
          <div ref={endRef} />
        </div>
      </div>

      <div className="shrink-0 pt-2">
        <Composer onSend={send} disabled={chat.streaming} autoFocus={autoFocus} />
        <p className="text-muted-foreground mt-2 px-1 text-[11.5px] leading-[1.5]">{t('disclaimer')}</p>
      </div>
    </div>
  );
}
