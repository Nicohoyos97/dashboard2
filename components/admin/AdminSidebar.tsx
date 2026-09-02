import { ExternalLink } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

import { NavList } from '@/components/shell/NavList';
import { type ShellUser, UserBlock } from '@/components/shell/UserBlock';
import { Link } from '@/i18n/navigation';
import { ADMIN_NAV_ITEMS } from '@/lib/admin-nav';
import type { FirmRole } from '@/lib/auth/getFirmMembership';

// Firm-portal sidebar body: admin nav, a link back to the client portal, and
// the user block with the firm role.
export async function AdminSidebar({ role, user }: { role: FirmRole; user: ShellUser }) {
  const [t, tNav] = await Promise.all([getTranslations('Shell'), getTranslations('Nav')]);
  const roleLabel = role === 'master_admin' ? t('roleMasterAdmin') : t('roleFirmStaff');

  return (
    <>
      <NavList items={ADMIN_NAV_ITEMS} namespace="Admin" />

      <Link
        href="/dashboard"
        className="text-muted-foreground hover:bg-secondary hover:text-ink mt-3 flex items-center gap-2 rounded-[10px] px-3 py-2 text-[13px] font-medium"
      >
        <ExternalLink className="size-4" aria-hidden="true" />
        {tNav('overview')}
      </Link>

      <UserBlock user={user} roleLabel={roleLabel} profileHref="/settings/profile" />
    </>
  );
}
