'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useRef } from 'react';

import type { PageContext } from '@/lib/ai/nick/types';

import { Composer } from './Composer';
import { AssistantText, MessageBubble, SourcesRow } from './MessageBubble';
import { NickOrb } from './NickOrb';
import { SuggestedQuestions } from './SuggestedQuestions';
import type { NickChat } from './useNickChat';

type Send = (text: string) => void;

// The conversation surface shared by the full page and the contextual panel:
// messages with Nick's orb beside each answer, the streaming answer, tool
// status, errors with retry, and the composer. An empty thread shows either
// the compact default (panel) or the hero the page passes in, which then owns
// the composer until the first message.
export function NickThread({
  chat,
  context,
  suggestionKeys,
  businessName,
  autoFocus = false,
  renderHero,
}: {
  chat: NickChat;
  context: PageContext | undefined;
  suggestionKeys: readonly string[];
  businessName: string;
  autoFocus?: boolean;
  renderHero?: (send: Send, disabled: boolean) => React.ReactNode;
}) {
  const t = useTranslations('Nick');
  const endRef = useRef<HTMLDivElement>(null);
  const send: Send = (text) => void chat.send(text, context);
  const isEmpty = chat.messages.length === 0 && !chat.streaming;
  const heroMode = isEmpty && renderHero !== undefined;

  useEffect(() => {
    if (!isEmpty) endRef.current?.scrollIntoView({ block: 'end' });
  }, [chat.messages.length, chat.streamText, chat.status, isEmpty]);

  const toolLabel = (tool: string) => {
    const key = `tool_${tool}`;
    return t.has(key) ? t('working', { what: t(key) }) : t('thinking');
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        className="min-h-0 flex-1 overflow-y-auto px-1 py-4"
        aria-live="polite"
        aria-busy={chat.streaming}
      >
        {heroMode && renderHero(send, chat.streaming)}

        {isEmpty && !heroMode && (
          <div className="mx-auto flex max-w-[560px] flex-col gap-5 py-6">
            <div className="flex items-start gap-3">
              <NickOrb size={44} />
              <div>
                <h2 className="text-ink text-[18px] font-bold">{t('emptyTitle')}</h2>
                <p className="text-muted-foreground mt-1 text-[14px] leading-[1.55]">
                  {t('emptyBody', { business: businessName })}
                </p>
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
              <div key={message.id} className="flex items-start gap-2.5">
                <NickOrb size={30} className="mt-1" />
                <div className="min-w-0 flex-1">
                  <MessageBubble role="assistant">
                    <AssistantText text={message.text} citations={message.citations} />
                    <SourcesRow citations={message.citations} />
                  </MessageBubble>
                </div>
              </div>
            ),
          )}

          {chat.streaming && (
            <div className="flex items-start gap-2.5">
              <NickOrb size={30} active className="mt-1" />
              <div className="min-w-0 flex-1">
                <MessageBubble role="assistant">
                  {chat.streamText ? (
                    <AssistantText text={chat.streamText} citations={[]} />
                  ) : (
                    <p className="text-muted-foreground text-[13.5px]">
                      {chat.status ? toolLabel(chat.status) : t('thinking')}
                    </p>
                  )}
                </MessageBubble>
              </div>
            </div>
          )}

          {chat.error && (
            <div
              role="alert"
              className="border-danger/30 bg-danger/5 text-ink flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 text-[13.5px]"
            >
              <span>{t(`error_${chat.error}`)}</span>
              {chat.error !== 'budget_exhausted' && chat.error !== 'preview_not_supported' && (
                <button
                  type="button"
                  onClick={() => void chat.retry()}
                  className="text-blue font-semibold hover:underline"
                >
                  {t('retry')}
                </button>
              )}
            </div>
          )}
          <div ref={endRef} />
        </div>
      </div>

      {!heroMode && (
        <div className="shrink-0 pt-2">
          <Composer onSend={send} disabled={chat.streaming} autoFocus={autoFocus} />
          <p className="text-muted-foreground mt-2 px-1 text-[11.5px] leading-[1.5]">
            {t('disclaimer')}
          </p>
        </div>
      )}
    </div>
  );
}
