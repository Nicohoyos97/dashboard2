'use client';

import { MessageSquarePlus } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useState } from 'react';

import { Link } from '@/i18n/navigation';
import type { ThreadMessage } from '@/lib/ai/nick/types';
import type { SessionRow } from '@/lib/ai/nick/persist';

import { NickThread } from './NickThread';
import { SUGGESTIONS } from './suggestions';
import { fromThread, useNickChat } from './useNickChat';

// Full-page Insights with Nick (spec §7): the caller's conversations on the
// left, the active thread on the right. A new conversation gets its id from
// the first streamed event; the URL is updated without a server round-trip so
// the streaming component is never unmounted mid-answer.
export function NickWorkspace({ sessions, activeSessionId, initialThread, businessName }: { sessions: SessionRow[]; activeSessionId: string | null; initialThread: ThreadMessage[]; businessName: string }) {
  const t = useTranslations('Nick');
  const locale = useLocale() === 'es' ? 'es' : 'en';
  const [list, setList] = useState(sessions);
  const onSession = useCallback((sessionId: string, firstMessage: string) => {
    setList((current) => (current.some((s) => s.id === sessionId) ? current : [{ id: sessionId, title: firstMessage.slice(0, 60), createdAt: new Date().toISOString(), lastMessageAt: new Date().toISOString() }, ...current]));
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('session', sessionId);
      window.history.replaceState(null, '', url.toString());
    }
  }, []);
  const chat = useNickChat({ sessionId: activeSessionId, initialMessages: fromThread(initialThread), locale, onSession });
  const currentId = chat.sessionId;
  const dateOf = (session: SessionRow) => new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(session.lastMessageAt ?? session.createdAt));

  return (
    <div className="grid min-h-0 flex-1 gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
      <aside className="hidden min-h-0 flex-col lg:flex" aria-label={t('conversations')}>
        <Link href="/chat" className="border-line bg-card text-ink hover:border-blue/50 hover:text-blue flex items-center gap-2 rounded-xl border px-3 py-2.5 text-[13.5px] font-semibold transition">
          <MessageSquarePlus className="size-4" aria-hidden="true" />
          {t('newConversation')}
        </Link>
        <p className="text-muted-foreground mt-5 px-1 text-[11.5px] font-semibold tracking-[0.1em] uppercase">{t('conversations')}</p>
        {list.length === 0 ? (
          <p className="text-muted-foreground mt-2 px-1 text-[13px]">{t('noConversations')}</p>
        ) : (
          <ul className="mt-2 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
            {list.map((session) => {
              const active = session.id === currentId;
              return (
                <li key={session.id}>
                  <Link
                    href={`/chat?session=${session.id}`}
                    aria-current={active ? 'page' : undefined}
                    className={`block rounded-xl px-3 py-2 transition ${active ? 'bg-blue-pale text-blue' : 'text-ink hover:bg-secondary'}`}
                  >
                    <span className="block truncate text-[13.5px] font-medium">{session.title ?? t('untitled')}</span>
                    <span className={`block text-[11.5px] ${active ? 'text-blue/80' : 'text-muted-foreground'}`}>{dateOf(session)}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </aside>
      <section className="border-line bg-paper-2 flex min-h-[60vh] min-w-0 flex-col rounded-2xl border p-3 sm:p-4">
        <NickThread chat={chat} context={{ page: 'chat' }} suggestionKeys={SUGGESTIONS.chat} businessName={businessName} autoFocus />
      </section>
    </div>
  );
}
