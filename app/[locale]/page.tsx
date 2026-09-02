// Root entry: send the visitor to the right place. Signed-in users land on the
// Overview; everyone else on sign-in. Locale-aware (English carries no prefix).
import { getLocale } from 'next-intl/server';
import { redirect } from 'next/navigation';

import { getCurrentUser } from '@/lib/auth/getCurrentUser';

export default async function Home() {
  const [user, locale] = await Promise.all([getCurrentUser(), getLocale()]);
  const prefix = locale === 'en' ? '' : `/${locale}`;
  redirect(user ? `${prefix}/dashboard` : `${prefix}/signin`);
}
