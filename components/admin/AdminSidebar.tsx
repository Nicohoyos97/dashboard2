import { getTranslations } from 'next-intl/server';

import { NavList } from '@/components/shell/NavList';
import { type ShellUser, UserBlock } from '@/components/shell/UserBlock';
import { ADMIN_NAV_ITEMS } from '@/lib/admin-nav';
import type { FirmRole } from '@/lib/auth/getFirmMembership';
import { createClient } from '@/lib/supabase/server';

// Firm-portal sidebar body: admin nav, then the user block with the firm
// role and a link back to the client portal under it.
export async function AdminSidebar({ role, user }: { role: FirmRole; user: ShellUser }) {
  const t = await getTranslations('Shell');
  const roleLabel = role === 'master_admin' ? t('roleMasterAdmin') : t('roleFirmStaff');

  // Client account requests are the one queue nobody is notified about
  // otherwise: the count rides the nav item so an open request is visible from
  // every firm page. A head count through RLS — no rows leave the server.
  const supabase = await createClient();
  const { count } = await supabase
    .from('account_requests')
    .select('id', { count: 'exact', head: true })
    .in('status', ['pending', 'in_progress']);
  const items = ADMIN_NAV_ITEMS.map((item) =>
    item.labelKey === 'navRequests' && count ? { ...item, badge: count } : item,
  );

  return (
    <>
      <NavList items={items} namespace="Admin" />
      <UserBlock
        user={user}
        roleLabel={roleLabel}
        profileHref="/settings/profile"
        links={[{ href: '/dashboard', labelKey: 'overview' }]}
        namespace="Nav"
      />
    </>
  );
}
