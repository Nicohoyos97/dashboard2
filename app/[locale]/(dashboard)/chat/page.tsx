// Insights with Nick — full-page chat (INITIAL_PROMPT.md §7, §10). The
// caller's own conversations and the selected thread are read through RLS;
// the firm's preview role has no conversation path and sees a notice.
import { getTranslations } from 'next-intl/server';
import { z } from 'zod';

import { NickWorkspace } from '@/components/chat/NickWorkspace';
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
      <Page title={t('title')} lede={t('ledeGeneric')}>
        <Notice title={t('pendingTitle')} body={t('pendingBody')} />
      </Page>
    );
  }
  if (entity.role === 'firm_preview') {
    return (
      <Page title={t('title')} lede={t('lede', { business: entity.name })}>
        <Notice title={t('previewTitle')} body={t('previewNotice')} />
      </Page>
    );
  }

  const supabase = await createClient();
  const requested = sessionParam.safeParse(params.session);
  const [sessions, active] = await Promise.all([
    listSessions(supabase, entity.id, user.id),
    requested.success
      ? loadSession(supabase, entity.id, user.id, requested.data)
      : Promise.resolve(null),
  ]);
  const [thread, { data: profile }] = await Promise.all([
    active ? loadThread(supabase, active.id) : Promise.resolve([]),
    supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle(),
  ]);
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
  });

  return (
    <main className="mx-auto flex min-h-[calc(100svh-4rem)] w-full max-w-[1200px] flex-col px-4 py-4 md:px-8 md:py-6">
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

function Page({
  title,
  lede,
  controls,
  children,
}: {
  title: string;
  lede: string;
  controls?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto flex w-full max-w-[1200px] flex-col px-6 py-10 md:px-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-ink text-[28px] font-bold tracking-[-0.01em]">{title}</h1>
          <p className="text-muted-foreground mt-1.5 text-[15px]">{lede}</p>
        </div>
        {controls && <div className="flex flex-wrap items-center gap-3">{controls}</div>}
      </div>
      {children}
    </main>
  );
}

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <section className="border-line bg-card mt-8 rounded-2xl border p-8 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <h2 className="text-ink text-[18px] font-semibold">{title}</h2>
      <p className="text-muted-foreground mt-2 max-w-[560px] text-[15px] leading-[1.55]">{body}</p>
    </section>
  );
}
