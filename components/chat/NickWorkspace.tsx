'use client';

import {
  CalendarClock,
  FileText,
  type LucideIcon,
  MessageSquarePlus,
  PanelLeftClose,
  PanelLeftOpen,
  Receipt,
  Trash2,
  TrendingUp,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState, useTransition } from 'react';

import { Link, useRouter } from '@/i18n/navigation';
import { deleteChatSession } from '@/lib/ai/nick/actions';
import type { SessionRow } from '@/lib/ai/nick/persist';
import type { ThreadMessage } from '@/lib/ai/nick/types';
import { cn } from '@/lib/utils/cn';

import { Composer } from './Composer';
import { NickOrb } from './NickOrb';
import { NickThread } from './NickThread';
import { SUGGESTIONS } from './suggestions';
import { fromThread, useNickChat } from './useNickChat';

const EXAMPLE_ICONS: LucideIcon[] = [TrendingUp, CalendarClock, FileText, Receipt];

const iconButton =
  'text-muted-foreground hover:bg-secondary hover:text-ink focus-visible:ring-blue/40 inline-flex size-9 items-center justify-center rounded-lg transition outline-none focus-visible:ring-3';

type DayPart = 'Morning' | 'Afternoon' | 'Evening';

function dayPart(hour: number): DayPart {
  if (hour < 12) return 'Morning';
  if (hour < 18) return 'Afternoon';
  return 'Evening';
}

// Ask Nick, full page (spec §7): an empty conversation opens on the orb, a
// greeting, the big composer and example cards; the history lives in a
// sub-sidebar that stays hidden until the panel button opens it. A new
// conversation gets its id from the first streamed event; the URL is updated
// without a server round-trip so the streaming component is never unmounted.
export function NickWorkspace({
  sessions,
  activeSessionId,
  initialThread,
  businessName,
  firstName,
  initialQuestion = null,
}: {
  sessions: SessionRow[];
  activeSessionId: string | null;
  initialThread: ThreadMessage[];
  businessName: string;
  firstName: string;
  initialQuestion?: string | null;
}) {
  const t = useTranslations('Nick');
  const locale = useLocale() === 'es' ? 'es' : 'en';
  const router = useRouter();
  const [list, setList] = useState(sessions);
  const [isHistoryOpen, setHistoryOpen] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState(false);
  const [isDeleting, startDelete] = useTransition();
  // Time of day is the visitor's, so it is resolved after mount (no mismatch).
  const [part, setPart] = useState<DayPart | null>(null);
  useEffect(() => setPart(dayPart(new Date().getHours())), []);

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
  const greeting = part
    ? firstName
      ? t(`greeting${part}`, { name: firstName })
      : t(`greeting${part}Anon`)
    : firstName
      ? t('greetingPlain', { name: firstName })
      : t('greetingPlainAnon');
  const currentTitle = list.find((s) => s.id === currentId)?.title ?? null;

  const hero = (send: (text: string) => void, disabled: boolean) => (
    <div className="mx-auto flex w-full max-w-[760px] flex-col items-center px-1 pt-4 sm:pt-10">
      <NickOrb size={116} active={chat.streaming} />
      <h2 className="text-ink mt-7 text-center text-[27px] leading-[1.15] font-semibold tracking-[-0.015em] sm:text-[32px]">
        {greeting}
        <br />
        {t('heroQuestionLead')}
        <span className="text-blue">{t('heroQuestionAccent')}</span>
      </h2>
      <div className="mt-8 w-full">
        <Composer onSend={send} disabled={disabled} autoFocus size="hero" />
      </div>
      <p className="text-muted-foreground mt-9 self-start text-[11.5px] font-semibold tracking-[0.1em] uppercase">
        {t('examplesTitle')}
      </p>
      <ul className="mt-3 grid w-full gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {SUGGESTIONS.chat.map((key, index) => {
          const Icon = EXAMPLE_ICONS[index] ?? TrendingUp;
          return (
            <li key={key}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => send(t(key))}
                className="border-line bg-card text-ink hover:border-blue/50 hover:bg-blue-pale/60 focus-visible:ring-blue/40 flex h-full w-full flex-col justify-between gap-6 rounded-2xl border p-4 text-left text-[13.5px] leading-[1.5] transition outline-none focus-visible:ring-3 disabled:opacity-50"
              >
                <span>{t(key)}</span>
                <Icon
                  className="text-muted-foreground size-4"
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
              </button>
            </li>
          );
        })}
      </ul>
      <p className="text-muted-foreground mt-8 text-center text-[11.5px] leading-[1.5]">
        {t('disclaimer')}
      </p>
    </div>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-1 px-1 pb-2">
        <button
          type="button"
          aria-expanded={isHistoryOpen}
          aria-controls="nick-history"
          aria-label={isHistoryOpen ? t('closeHistory') : t('openHistory')}
          title={isHistoryOpen ? t('closeHistory') : t('openHistory')}
          onClick={() => setHistoryOpen((open) => !open)}
          className={cn(iconButton, isHistoryOpen && 'bg-secondary text-ink')}
        >
          {isHistoryOpen ? (
            <PanelLeftClose className="size-[18px]" strokeWidth={1.75} aria-hidden="true" />
          ) : (
            <PanelLeftOpen className="size-[18px]" strokeWidth={1.75} aria-hidden="true" />
          )}
        </button>
        <Link
          href="/chat"
          aria-label={t('newConversation')}
          title={t('newConversation')}
          className={iconButton}
        >
          <MessageSquarePlus className="size-[18px]" strokeWidth={1.75} aria-hidden="true" />
        </Link>
        {currentTitle && (
          <span className="text-muted-foreground ml-1 truncate text-[13px]">{currentTitle}</span>
        )}
      </div>

      <div className="relative min-h-0 flex-1">
        {isHistoryOpen && (
          <button
            type="button"
            tabIndex={-1}
            aria-hidden="true"
            onClick={() => setHistoryOpen(false)}
            className="absolute inset-0 z-[5] cursor-default"
          />
        )}
        <aside
          id="nick-history"
          aria-label={t('history')}
          aria-hidden={!isHistoryOpen}
          className={cn(
            'border-line bg-card absolute inset-y-0 left-0 z-10 flex w-[300px] max-w-[88%] flex-col rounded-2xl border p-3 shadow-[0_8px_24px_rgba(15,23,42,0.12)] transition-[transform,opacity] duration-200 ease-out motion-reduce:transition-none',
            isHistoryOpen
              ? 'translate-x-0 opacity-100'
              : 'pointer-events-none -translate-x-4 opacity-0',
          )}
        >
          <div className="flex items-center justify-between px-1">
            <p className="text-muted-foreground text-[11.5px] font-semibold tracking-[0.1em] uppercase">
              {t('history')}
            </p>
            <Link
              href="/chat"
              tabIndex={isHistoryOpen ? 0 : -1}
              onClick={() => setHistoryOpen(false)}
              className="text-blue text-[12.5px] font-semibold hover:underline"
            >
              {t('newConversation')}
            </Link>
          </div>
          {list.length === 0 ? (
            <p className="text-muted-foreground mt-3 px-1 text-[13px]">{t('noConversations')}</p>
          ) : (
            <ul className="mt-2 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
              {list.map((session) => {
                const active = session.id === currentId;
                if (confirmId === session.id) {
                  return (
                    <li
                      key={session.id}
                      className="border-line bg-paper rounded-xl border px-3 py-2.5"
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
                      tabIndex={isHistoryOpen ? 0 : -1}
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
                      tabIndex={isHistoryOpen ? 0 : -1}
                      onClick={() => setConfirmId(session.id)}
                      className="text-muted-foreground/70 hover:bg-danger/10 hover:text-danger focus-visible:ring-blue/40 inline-flex size-9 shrink-0 items-center justify-center rounded-lg opacity-0 transition outline-none group-hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-3 [@media(hover:none)]:opacity-100"
                    >
                      <Trash2 className="size-4" strokeWidth={1.75} aria-hidden="true" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>

        <section className="flex h-full min-h-0 flex-col">
          <NickThread
            chat={chat}
            context={{ page: 'chat' }}
            suggestionKeys={SUGGESTIONS.chat}
            businessName={businessName}
            autoFocus
            renderHero={hero}
          />
        </section>
      </div>
    </div>
  );
}
