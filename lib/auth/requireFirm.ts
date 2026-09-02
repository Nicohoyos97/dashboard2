// Guards for firm-side server code. Both redirect instead of throwing:
//   no session            → /signin
//   not a firm user       → /dashboard (the client portal)
//   firm user at aal1     → /admin/mfa (enroll or verify TOTP)
// requireFirmAdmin additionally demands the master_admin role (firm_staff is
// read-only, INITIAL_PROMPT.md §5). RLS enforces all of this again in the DB.
import { getLocale } from 'next-intl/server';
import { redirect } from 'next/navigation';

import { getAssuranceLevel } from './getAssuranceLevel';
import { getCurrentUser } from './getCurrentUser';
import { type FirmMembership, getFirmMembership } from './getFirmMembership';

export type FirmContext = FirmMembership & { userId: string };

export async function requireFirmMember(): Promise<FirmContext> {
  const [user, locale] = await Promise.all([getCurrentUser(), getLocale()]);
  const prefix = locale === 'en' ? '' : `/${locale}`;
  if (!user) redirect(`${prefix}/signin?redirectedFrom=${encodeURIComponent(`${prefix}/admin`)}`);

  const membership = await getFirmMembership();
  if (!membership) redirect(`${prefix}/dashboard`);

  if ((await getAssuranceLevel()) !== 'aal2') redirect(`${prefix}/admin/mfa`);

  return { ...membership, userId: user.id };
}

export async function requireFirmAdmin(): Promise<FirmContext> {
  const ctx = await requireFirmMember();
  if (ctx.role !== 'master_admin') {
    const locale = await getLocale();
    redirect(locale === 'en' ? '/admin?denied=1' : `/${locale}/admin?denied=1`);
  }
  return ctx;
}
