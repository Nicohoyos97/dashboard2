'use client';

import { MessageSquarePlus, Trash2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState, useTransition } from 'react';

import { Link, useRouter } from '@/i18n/navigation';
import { deleteChatSession } from '@/lib/ai/nick/actions';
import type { SessionRow } from '@/lib/ai/nick/persist';
import type { ThreadMessage } from '@/lib/ai/nick/types';

import { NickThread } from './NickThread';
import { SUGGESTIONS } from './suggestions';
import { fromThread, useNickChat } from './useNickChat';

// Full-page Insights with Nick (spec §7): the caller's conversations on the
// left, the active thread on the right. A new conversation gets its id from
// the first streamed event; the URL is updated without a server round-trip so
// the streaming component is never unmounted mid-answer.
export function NickWorkspace({
  sessions,
  activeSessionId,
  initialThread,
  businessName,
  initialQuestion = null,
}: {
  sessions: SessionRow[];
  activeSessionId: string | null;
  initialThread: ThreadMessage[];
  businessName: string;
  initialQuestion?: string | null;
}) {
  const t = useTranslations('Nick');
  const locale = useLocale() === 'es' ? 'es' : 'en';
  const router = useRouter();
  const [list, setList] = useState(sessions);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState(false);
  const [isDeleting, startDelete] = useTransition();
  const onSession = useCallback((sessionId: string, firstMessage: string) => {
    setList((current) =>
      current.some((s) => s.id === sessionId)
        ? current
        : [
            {
              id: sessionId,
              title: firstMessage.slice(0, 60),
              createdAt: new Date().toISOString(),
              lastMessageAt: new Date().toISOString(),
            },
            ...current,
          ],
    );
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('session', sessionId);
      url.searchParams.delete('q');
      window.history.replaceState(null, '', url.toString());
    }
  }, []);
  const chat = useNickChat({
    sessionId: activeSessionId,
    initialMessages: fromThread(initialThread),
    locale,
    onSession,
  });
  const currentId = chat.sessionId;
  const askedRef = useRef(false);
  // A question handed over by the top-bar search starts the conversation once.
  useEffect(() => {
    if (!initialQuestion || askedRef.current || chat.messages.length > 0 || chat.streaming) return;
    askedRef.current = true;
    void chat.send(initialQuestion, { page: 'chat' });
  }, [initialQuestion, chat]);

  const remove = (sessionId: string) => {
    setDeleteError(false);
    startDelete(async () => {
      const result = await deleteChatSession({ sessionId });
      if (!result.ok) {
        setDeleteError(true);
        return;
      }
      setConfirmId(null);
      setList((current) => current.filter((s) => s.id !== sessionId));
      if (sessionId === currentId) router.push('/chat');
    });
  };
  const dateOf = (session: SessionRow) =>
    new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(
      new Date(session.lastMessageAt ?? session.createdAt),
    );

  return (
    <div className="grid min-h-0 flex-1 gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
      <aside className="hidden min-h-0 flex-col lg:flex" aria-label={t('conversations')}>
        <Link
          href="/chat"
          className="border-line bg-card text-ink hover:border-blue/50 hover:text-blue flex items-center gap-2 rounded-xl border px-3 py-2.5 text-[13.5px] font-semibold transition"
        >
          <MessageSquarePlus className="size-4" aria-hidden="true" />
          {t('newConversation')}
        </Link>
        <p className="text-muted-foreground mt-5 px-1 text-[11.5px] font-semibold tracking-[0.1em] uppercase">
          {t('conversations')}
        </p>
        {list.length === 0 ? (
          <p className="text-muted-foreground mt-2 px-1 text-[13px]">{t('noConversations')}</p>
        ) : (
          <ul className="mt-2 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
            {list.map((session) => {
              const active = session.id === currentId;
              if (confirmId === session.id) {
                return (
                  <li
                    key={session.id}
                    className="border-line bg-card rounded-xl border px-3 py-2.5"
                  >
                    <p className="text-ink text-[13px] font-medium">{t('deleteConfirm')}</p>
                    <div className="mt-2 flex items-center gap-2">
                      <button
                        type="button"
                        disabled={isDeleting}
                        onClick={() => remove(session.id)}
                        className="bg-danger hover:bg-danger/90 h-8 rounded-lg px-3 text-[12.5px] font-semibold text-white transition disabled:opacity-60"
                      >
                        {t('delete')}
                      </button>
                      <button
                        type="button"
                        disabled={isDeleting}
                        onClick={() => setConfirmId(null)}
                        className="text-muted-foreground hover:text-ink h-8 rounded-lg px-2 text-[12.5px] font-medium"
                      >
                        {t('cancel')}
                      </button>
                    </div>
                    {deleteError && (
                      <p role="alert" className="text-danger mt-2 text-[12px]">
                        {t('deleteFailed')}
                      </p>
                    )}
                  </li>
                );
              }
              return (
                <li key={session.id} className="group flex items-center gap-1">
                  <Link
                    href={`/chat?session=${session.id}`}
                    aria-current={active ? 'page' : undefined}
                    className={`block min-w-0 flex-1 rounded-xl px-3 py-2 transition ${active ? 'bg-blue-pale text-blue' : 'text-ink hover:bg-secondary'}`}
                  >
                    <span className="block truncate text-[13.5px] font-medium">
                      {session.title ?? t('untitled')}
                    </span>
                    <span
                      className={`block text-[11.5px] ${active ? 'text-blue/80' : 'text-muted-foreground'}`}
                    >
                      {dateOf(session)}
                    </span>
                  </Link>
                  <button
                    type="button"
                    aria-label={t('deleteConversation')}
                    title={t('deleteConversation')}
                    onClick={() => setConfirmId(session.id)}
                    className="text-muted-foreground/70 hover:bg-danger/10 hover:text-danger focus-visible:ring-blue/40 inline-flex size-9 shrink-0 items-center justify-center rounded-lg opacity-0 transition outline-none group-hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-3 lg:opacity-0 [@media(hover:none)]:opacity-100"
                  >
                    <Trash2 className="size-4" strokeWidth={1.75} aria-hidden="true" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </aside>
      <section className="border-line bg-paper-2 flex min-h-[60vh] min-w-0 flex-col rounded-2xl border p-3 sm:p-4">
        <NickThread
          chat={chat}
          context={{ page: 'chat' }}
          suggestionKeys={SUGGESTIONS.chat}
          businessName={businessName}
          autoFocus
        />
      </section>
    </div>
  );
}
