// Every firm page lives under this group: it requires aal2 (TOTP completed in
// this session) and renders the firm shell. requireFirmMember() redirects to
// /admin/mfa when the session is still at aal1.
import { getTranslations } from 'next-intl/server';

import { AdminSidebar } from '@/components/admin/AdminSidebar';
import { AppShell } from '@/components/shell/AppShell';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { requireFirmMember } from '@/lib/auth/requireFirm';
import { createClient } from '@/lib/supabase/server';

export default async function AdminGatedLayout({ children }: { children: React.ReactNode }) {
  const firm = await requireFirmMember();
  const [user, t] = await Promise.all([getCurrentUser(), getTranslations('Admin')]);

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, avatar_url')
    .eq('id', firm.userId)
    .maybeSingle();

  return (
    <AppShell
      brandHref="/admin"
      brandBadge={t('portalBadge')}
      sidebar={
        <AdminSidebar
          role={firm.role}
          user={{
            name: profile?.full_name ?? '',
            email: user?.email ?? '',
            avatarUrl: profile?.avatar_url ?? null,
          }}
        />
      }
    >
      {children}
    </AppShell>
  );
}
