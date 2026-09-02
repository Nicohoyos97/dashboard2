// Firm portal root: session + firm-membership guard. The second factor is
// checked one level down, in (gated)/layout.tsx, so that /admin/mfa itself is
// reachable at aal1 to enroll or verify. RLS repeats every check in the DB.
import { getLocale } from 'next-intl/server';
import { redirect } from 'next/navigation';

import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { getFirmMembership } from '@/lib/auth/getFirmMembership';

export default async function AdminRootLayout({ children }: { children: React.ReactNode }) {
  const [user, locale] = await Promise.all([getCurrentUser(), getLocale()]);
  const prefix = locale === 'en' ? '' : `/${locale}`;
  if (!user) redirect(`${prefix}/signin?redirectedFrom=${encodeURIComponent(`${prefix}/admin`)}`);

  const membership = await getFirmMembership();
  if (!membership) redirect(`${prefix}/dashboard`);

  return <>{children}</>;
}
