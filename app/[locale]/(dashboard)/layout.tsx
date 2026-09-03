// Authenticated client-portal shell: session guard + sidebar/drawer. The
// middleware also guards these routes, but the layout enforces the session
// server-side as defense in depth and gives us the user for the chrome.
//
// The entity may be null: businesses are provisioned by the firm, so a freshly
// signed-up user has no membership until the firm links them. Pages handle that
// with a pending state (see dashboard/page.tsx); nothing is auto-created.
import { getLocale, getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';

import { Sidebar } from '@/components/dashboard/Sidebar';
import { AppShell } from '@/components/shell/AppShell';
import { TopBar } from '@/components/shell/TopBar';
import { getCurrentEntity, listEntities } from '@/lib/auth/getCurrentEntity';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { exitPreview } from '@/lib/entities/actions';
import { BOTTOM_NAV_ITEMS, clientNavItems } from '@/lib/nav';
import { loadPortalEntitySettings } from '@/lib/portal/load';
import { loadNotifications } from '@/lib/portal/notifications';
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

  const preview = currentEntity?.role === 'firm_preview' ? currentEntity : null;
  const t = preview ? await getTranslations('Overview') : null;
  // Sales Taxes is hidden for a business the firm has not enabled it for; the
  // route 404s on the same flag, so a hidden module is not merely a hidden link.
  const settings = currentEntity ? await loadPortalEntitySettings(supabase, currentEntity.id) : null;
  const navItems = clientNavItems(settings?.salesTaxEnabled ?? false);
  // A firm user previewing the portal sees the client's chrome but their own
  // notifications would be noise here, so the bell is client-side only.
  const notifications = preview ? [] : await loadNotifications(currentEntity?.id ?? null);

  return (
    <AppShell
      brandHref="/dashboard"
      topBar={
        <TopBar
          items={[...navItems, ...BOTTOM_NAV_ITEMS]}
          namespace="Nav"
          askNick={!preview}
          helpHref="/help"
          notifications={notifications}
        />
      }
      sidebar={
        <Sidebar
          navItems={navItems}
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
      {preview && t && (
        <div className="bg-warning/10 border-warning/40 text-ink flex flex-wrap items-center gap-3 border-b px-6 py-2.5 text-[13.5px]">
          <span className="flex-1">{t('previewBanner', { business: preview.name })}</span>
          <form action={exitPreview.bind(null, { entityId: preview.id })}>
            <button type="submit" className="text-blue font-semibold hover:underline">
              {t('exitPreview')}
            </button>
          </form>
        </div>
      )}
      {children}
    </AppShell>
  );
}
