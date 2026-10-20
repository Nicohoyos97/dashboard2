// Firm portal root: session + firm-membership guard. The second factor is
// checked one level down, in (gated)/layout.tsx, so that /admin/mfa itself is
// reachable at aal1 to enroll or verify. RLS repeats every check in the DB.
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import { redirect } from 'next/navigation';

import { ADMIN_CLIENT_NAMESPACES, pickMessages } from '@/i18n/client-messages';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { getFirmMembership } from '@/lib/auth/getFirmMembership';

export default async function AdminRootLayout({ children }: { children: React.ReactNode }) {
  const [user, locale] = await Promise.all([getCurrentUser(), getLocale()]);
  const prefix = locale === 'en' ? '' : `/${locale}`;
  if (!user) redirect(`${prefix}/signin?redirectedFrom=${encodeURIComponent(`${prefix}/admin`)}`);

  const membership = await getFirmMembership();
  if (!membership) redirect(`${prefix}/dashboard`);

  // The firm's own namespace reaches the browser here and nowhere else; a
  // nested provider replaces its parent's messages, so the list carries the
  // shared namespaces too (i18n/client-messages.ts).
  return (
    <NextIntlClientProvider messages={pickMessages(await getMessages(), ADMIN_CLIENT_NAMESPACES)}>{children}</NextIntlClientProvider>
  );
}
