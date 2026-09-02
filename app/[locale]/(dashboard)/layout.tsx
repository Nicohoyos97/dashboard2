// Authenticated shell: session guard + sidebar. The middleware also guards
// these routes, but the layout enforces the session server-side as defense in
// depth and gives us the user for the chrome.
//
// The entity may be null: businesses are provisioned by the firm, so a freshly
// signed-up user has no membership until the firm links them. Pages handle that
// with a pending state (see dashboard/page.tsx); nothing is auto-created.
import { getLocale } from 'next-intl/server';
import { redirect } from 'next/navigation';

import { Sidebar } from '@/components/dashboard/Sidebar';
import { getCurrentEntity } from '@/lib/auth/getCurrentEntity';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) {
    const locale = await getLocale();
    redirect(locale === 'en' ? '/signin' : `/${locale}/signin`);
  }

  const entity = await getCurrentEntity();

  return (
    <div className="bg-paper flex min-h-screen">
      <Sidebar email={user.email ?? ''} entityName={entity?.name ?? ''} />
      <div className="flex-1">{children}</div>
    </div>
  );
}
