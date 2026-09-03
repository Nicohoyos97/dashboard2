'use client';

import {
  CalendarClock,
  FileText,
  type LucideIcon,
  MessageSquarePlus,
  PanelLeftClose,
  PanelLeftOpen,
  Receipt,
  Search,
  Trash2,
  TrendingUp,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState, useTransition } from 'react';

import { Link, useRouter } from '@/i18n/navigation';
import { deleteChatSession } from '@/lib/ai/nick/actions';
import type { SessionRow } from '@/lib/ai/nick/persist';
import { matchesKeywords, titleFromMessage } from '@/lib/ai/nick/title';
import type { ThreadMessage } from '@/lib/ai/nick/types';
import { cn } from '@/lib/utils/cn';

import { Composer } from './Composer';
import { NickOrb } from './NickOrb';
import { NickThread } from './NickThread';
import { SUGGESTIONS } from './suggestions';
import { fromThread, useNickChat } from './useNickChat';

const EXAMPLE_ICONS: LucideIcon[] = [TrendingUp, CalendarClock, FileText, Receipt];
const SIDEBAR_WIDTH = 272;

const iconButton =
  'text-muted-foreground hover:bg-secondary hover:text-ink focus-visible:ring-blue/40 inline-flex size-9 shrink-0 items-center justify-center rounded-lg transition outline-none focus-visible:ring-3';

type DayPart = 'Morning' | 'Afternoon' | 'Evening';

function dayPart(hour: number): DayPart {
  if (hour < 12) return 'Morning';
  if (hour < 18) return 'Afternoon';
  return 'Evening';
}

// Ask Nick, full page (spec §7). An empty conversation opens on the orb, a
// greeting, the big composer and example cards. The history is a sidebar in
// the ChatGPT/Claude mould: closed by default, it slides open from the left
// and pushes the thread aside, with a new-chat action, a keyword search and
// the conversations named after their first question. A new conversation
// gets its id from the first streamed event; the URL is updated without a
// server round-trip so the streaming component is never unmounted.
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
  const [isOpen, setOpen] = useState(false);
  const [query, setQuery] = useState('');
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
              title: titleFromMessage(firstMessage),
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
  const current = list.find((s) => s.id === currentId) ?? null;
  const visible = list.filter((s) => matchesKeywords(s.title ?? '', query));

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
    <div className="relative flex min-h-0 flex-1">
      {/* History sidebar: width animates from 0 on desktop; overlays on phones. */}
      <aside
        id="nick-history"
        aria-label={t('history')}
        aria-hidden={!isOpen}
        style={{ width: isOpen ? SIDEBAR_WIDTH : 0 }}
        className={cn(
          'border-line bg-card z-10 shrink-0 overflow-hidden transition-[width] duration-200 ease-out motion-reduce:transition-none max-md:absolute max-md:inset-y-0 max-md:left-0 md:relative',
          isOpen ? 'border-r max-md:shadow-xl' : '',
        )}
      >
        <div className="flex h-full flex-col px-3 py-2" style={{ width: SIDEBAR_WIDTH }}>
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-expanded={isOpen}
              aria-controls="nick-history"
              aria-label={t('closeHistory')}
              title={t('closeHistory')}
              tabIndex={isOpen ? 0 : -1}
              onClick={() => setOpen(false)}
              className={iconButton}
            >
              <PanelLeftClose className="size-[18px]" strokeWidth={1.75} aria-hidden="true" />
            </button>
          </div>

          <Link
            href="/chat"
            tabIndex={isOpen ? 0 : -1}
            onClick={() => setOpen(false)}
            className="text-ink hover:bg-secondary focus-visible:ring-blue/40 mt-2 flex h-10 items-center gap-2.5 rounded-lg px-2.5 text-[14px] font-medium transition outline-none focus-visible:ring-3"
          >
            <MessageSquarePlus className="size-[18px]" strokeWidth={1.75} aria-hidden="true" />
            {t('newConversation')}
          </Link>

          <label className="relative mt-2 block">
            <span className="sr-only">{t('searchHistory')}</span>
            <Search
              className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
              strokeWidth={1.75}
              aria-hidden="true"
            />
            <input
              type="search"
              value={query}
              tabIndex={isOpen ? 0 : -1}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('searchHistory')}
              className="border-line bg-paper text-ink placeholder:text-muted-foreground/70 focus:border-blue focus:bg-card h-10 w-full rounded-lg border pr-3 pl-9 text-[13.5px] transition outline-none focus:shadow-[0_0_0_4px_rgba(37,99,235,0.12)]"
            />
          </label>

          <p className="text-muted-foreground mt-5 px-2.5 text-[11.5px] font-semibold tracking-[0.1em] uppercase">
            {t('history')}
          </p>
          {list.length === 0 ? (
            <p className="text-muted-foreground mt-2 px-2.5 text-[13px]">{t('noConversations')}</p>
          ) : visible.length === 0 ? (
            <p className="text-muted-foreground mt-2 px-2.5 text-[13px]">{t('noMatches')}</p>
          ) : (
            <ul className="mt-1 flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto">
              {visible.map((session) => {
                const active = session.id === currentId;
                if (confirmId === session.id) {
                  return (
                    <li
                      key={session.id}
                      className="border-line bg-paper rounded-lg border px-2.5 py-2"
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
                  <li key={session.id} className="group flex items-center gap-0.5">
                    <Link
                      href={`/chat?session=${session.id}`}
                      aria-current={active ? 'page' : undefined}
                      tabIndex={isOpen ? 0 : -1}
                      className={cn(
                        'block min-w-0 flex-1 rounded-lg px-2.5 py-2 transition',
                        active ? 'bg-secondary text-ink' : 'text-ink hover:bg-secondary/70',
                      )}
                    >
                      <span className="block truncate text-[13.5px]">
                        {session.title ?? t('untitled')}
                      </span>
                      <span className="text-muted-foreground block text-[11.5px]">
                        {dateOf(session)}
                      </span>
                    </Link>
                    <button
                      type="button"
                      aria-label={t('deleteConversation')}
                      title={t('deleteConversation')}
                      tabIndex={isOpen ? 0 : -1}
                      onClick={() => setConfirmId(session.id)}
                      className="text-muted-foreground/70 hover:bg-danger/10 hover:text-danger focus-visible:ring-blue/40 inline-flex size-8 shrink-0 items-center justify-center rounded-lg opacity-0 transition outline-none group-hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-3 [@media(hover:none)]:opacity-100"
                    >
                      <Trash2 className="size-4" strokeWidth={1.75} aria-hidden="true" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </aside>

      {isOpen && (
        <button
          type="button"
          tabIndex={-1}
          aria-hidden="true"
          onClick={() => setOpen(false)}
          className="absolute inset-0 z-[5] cursor-default md:hidden"
        />
      )}

      <section className={cn('flex min-w-0 flex-1 flex-col', isOpen && 'md:pl-4')}>
        <div className="flex items-center gap-1 px-1 pb-2">
          {!isOpen && (
            <button
              type="button"
              aria-expanded={isOpen}
              aria-controls="nick-history"
              aria-label={t('openHistory')}
              title={t('openHistory')}
              onClick={() => setOpen(true)}
              className={iconButton}
            >
              <PanelLeftOpen className="size-[18px]" strokeWidth={1.75} aria-hidden="true" />
            </button>
          )}
          <Link
            href="/chat"
            aria-label={t('newConversation')}
            title={t('newConversation')}
            className={iconButton}
          >
            <MessageSquarePlus className="size-[18px]" strokeWidth={1.75} aria-hidden="true" />
          </Link>
          {current?.title && (
            <span className="text-muted-foreground ml-1 truncate text-[13px]">{current.title}</span>
          )}
        </div>
        <div className="flex min-h-0 flex-1 flex-col">
          <NickThread
            chat={chat}
            context={{ page: 'chat' }}
            suggestionKeys={SUGGESTIONS.chat}
            businessName={businessName}
            autoFocus
            renderHero={hero}
          />
        </div>
      </section>
    </div>
  );
}
