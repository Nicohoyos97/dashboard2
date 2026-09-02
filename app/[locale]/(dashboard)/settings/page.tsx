// /settings → redirect to the first section (profile), locale-aware.
import { getLocale } from 'next-intl/server';
import { redirect } from 'next/navigation';

export default async function SettingsPage() {
  const locale = await getLocale();
  redirect(locale === 'en' ? '/settings/profile' : `/${locale}/settings/profile`);
}
