// Sign-up is closed. Accounts follow a purchase: the client picks a plan on the
// marketing site, the firm provisions the business and emails the invitation,
// and the client sets a password at /invite. This route stays so old links,
// bookmarks and password managers land on the plans instead of a dead end.
import { getLocale } from 'next-intl/server';
import { redirect } from 'next/navigation';

import { getStartedUrl } from '@/lib/auth/get-started';

export default async function SignUpPage() {
  redirect(getStartedUrl(await getLocale()));
}
