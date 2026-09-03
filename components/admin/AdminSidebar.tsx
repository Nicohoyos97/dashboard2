import { getTranslations } from 'next-intl/server';

import { NavList } from '@/components/shell/NavList';
import { type ShellUser, UserBlock } from '@/components/shell/UserBlock';
import { ADMIN_NAV_ITEMS } from '@/lib/admin-nav';
import type { FirmRole } from '@/lib/auth/getFirmMembership';

// Firm-portal sidebar body: admin nav, then the user block with the firm
// role and a link back to the client portal under it.
export async function AdminSidebar({ role, user }: { role: FirmRole; user: ShellUser }) {
  const t = await getTranslations('Shell');
  const roleLabel = role === 'master_admin' ? t('roleMasterAdmin') : t('roleFirmStaff');

  return (
    <>
      <NavList items={ADMIN_NAV_ITEMS} namespace="Admin" />
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
