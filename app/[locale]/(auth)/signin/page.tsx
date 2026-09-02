// Sign-in page. Renders the shared auth experience in sign-in mode and surfaces
// OAuth error/return params from the URL (translated for the active locale).
import { getTranslations } from 'next-intl/server';

import { AuthExperience } from '@/components/auth/AuthExperience';

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; redirectedFrom?: string }>;
}) {
  const params = await searchParams;
  const t = await getTranslations('AuthErrors');

  let error: string | undefined;
  if (params.error) {
    error =
      params.error === 'access_denied' || params.error === 'oauth_cancelled'
        ? t('oauthCancelled')
        : t('serverError');
  }

  return (
    <AuthExperience initialMode="signin" redirectTo={params.redirectedFrom} initialError={error} />
  );
}
