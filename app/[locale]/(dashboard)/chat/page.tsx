// Insights with Nick — full-page chat (INITIAL_PROMPT.md §7, §10). The
// caller's own conversations and the selected thread are read through RLS;
// the firm's preview role has no conversation path and sees a notice.
import { getTranslations } from 'next-intl/server';
import { z } from 'zod';

import { NickWorkspace } from '@/components/chat/NickWorkspace';
import { PortalPage } from '@/components/portal/PortalPage';
import { NICK_LIMITS } from '@/lib/ai/nick/config';
import { listSessions, loadSession, loadThread } from '@/lib/ai/nick/persist';
import { logAccess } from '@/lib/audit/logAccess';
import { getCurrentEntity } from '@/lib/auth/getCurrentEntity';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { createClient } from '@/lib/supabase/server';

const sessionParam = z.string().uuid();

export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{ session?: string; q?: string }>;
}) {
  const [t, user, entity, params] = await Promise.all([
    getTranslations('Nick'),
    getCurrentUser(),
    getCurrentEntity(),
    searchParams,
  ]);

  if (!entity || !user) {
    return (
      <PortalPage title={t('title')} lede={t('ledeGeneric')}>
        <Notice title={t('pendingTitle')} body={t('pendingBody')} />
      </PortalPage>
    );
  }
  if (entity.role === 'firm_preview') {
    return (
      <PortalPage title={t('title')} lede={t('lede', { business: entity.name })}>
        <Notice title={t('previewTitle')} body={t('previewNotice')} />
      </PortalPage>
    );
  }

  const supabase = await createClient();
  const requested = sessionParam.safeParse(params.session);
  // One wave. The thread is read beside the check that the session is this
  // user's own and kept only if it is, so a session id in the URL never shows
  // anyone else's conversation; the profile uses the layout's columns, so the
  // two share one request.
  const [sessions, active, requestedThread, { data: profile }] = await Promise.all([
    listSessions(supabase, entity.id, user.id),
    requested.success
      ? loadSession(supabase, entity.id, user.id, requested.data)
      : Promise.resolve(null),
    requested.success ? loadThread(supabase, requested.data) : Promise.resolve([]),
    supabase.from('profiles').select('full_name, avatar_url').eq('id', user.id).maybeSingle(),
  ]);
  const thread = active ? requestedThread : [];
  const firstName = profile?.full_name?.trim().split(/\s+/)[0] ?? '';
  const question =
    !active && typeof params.q === 'string'
      ? params.q.trim().slice(0, NICK_LIMITS.maxMessageChars)
      : '';
  await logAccess({
    action: 'chat.view',
    resourceType: 'business_entity',
    resourceId: entity.id,
    businessEntityId: entity.id,
    metadata: { session_count: sessions.length },
  }, { afterResponse: true });

  return (
    // A definite height, not a minimum: the thread below scrolls inside itself
    // and the composer stays put. With only `min-h` the flex chain had no size
    // to distribute, so `overflow-y-auto` never engaged, the document grew with
    // the conversation and the composer was pushed off the bottom of the
    // screen. The offset is the chrome around it: the mobile header (3.5rem)
    // and the tab bar under it (`--tabbar-offset`, set by AppShell), or, from
    // `md` up, the top bar (4rem).
    <main className="mx-auto flex h-[calc(100svh-3.5rem-var(--tabbar-offset,0px))] w-full max-w-[1200px] flex-col overflow-hidden px-4 py-4 md:h-[calc(100svh-4rem)] md:px-8 md:py-6">
      <h1 className="sr-only">{t('title')}</h1>
      <NickWorkspace
        key={active?.id ?? 'new'}
        sessions={sessions}
        activeSessionId={active?.id ?? null}
        initialThread={thread}
        businessName={entity.name}
        firstName={firstName}
        initialQuestion={question || null}
      />
    </main>
  );
}

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <section className="border-line bg-card mt-8 rounded-2xl border p-8 shadow-card">
      <h2 className="text-ink text-heading font-semibold">{title}</h2>
      <p className="text-muted-foreground mt-2 max-w-[560px] text-body leading-[1.55]">{body}</p>
    </section>
  );
}
