// Sign-in page. The only way into the portal: sign-up is closed (see
// lib/auth/get-started.ts). Surfaces the auth error/return params from the URL
// (translated for the active locale).
import { getTranslations } from 'next-intl/server';

import { AuthExperience } from '@/components/auth/AuthExperience';

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; redirectedFrom?: string }>;
}) {
  const params = await searchParams;
  const t = await getTranslations('AuthErrors');

  // `no_account` is /callback's answer to a sign-in that has no account behind
  // it — an unknown Google address now that sign-ups are closed. It says so
  // plainly; the link to the plans sits under the form.
  let error: string | undefined;
  if (params.error) {
    if (params.error === 'no_account') error = t('noAccount');
    else if (params.error === 'access_denied' || params.error === 'oauth_cancelled')
      error = t('oauthCancelled');
    else error = t('serverError');
  }

  return <AuthExperience redirectTo={params.redirectedFrom} initialError={error} />;
}
