// Authenticated client-portal shell: session guard + sidebar/drawer. The
// middleware also guards these routes, but the layout enforces the session
// server-side as defense in depth and gives us the user for the chrome.
//
// The entity may be null: businesses are provisioned by the firm, so a freshly
// signed-up user has no membership until the firm links them. Pages handle that
// with a pending state (see dashboard/page.tsx); nothing is auto-created.
import { getLocale } from 'next-intl/server';
import { redirect } from 'next/navigation';

import { Sidebar } from '@/components/dashboard/Sidebar';
import { AppShell } from '@/components/shell/AppShell';
import { getCurrentEntity, listEntities } from '@/lib/auth/getCurrentEntity';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { createClient } from '@/lib/supabase/server';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) {
    const locale = await getLocale();
    redirect(locale === 'en' ? '/signin' : `/${locale}/signin`);
  }

  const supabase = await createClient();
  const [entities, currentEntity, { data: profile }] = await Promise.all([
    listEntities(),
    getCurrentEntity(),
    supabase.from('profiles').select('full_name, avatar_url').eq('id', user.id).maybeSingle(),
  ]);

  return (
    <AppShell
      brandHref="/dashboard"
      sidebar={
        <Sidebar
          entities={entities}
          currentEntity={currentEntity}
          user={{
            name: profile?.full_name ?? '',
            email: user.email ?? '',
            avatarUrl: profile?.avatar_url ?? null,
          }}
        />
      }
    >
      {children}
    </AppShell>
  );
}
