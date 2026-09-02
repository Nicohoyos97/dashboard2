// Forgot-password page: requests a reset link. Surfaces the expired-link error
// when /callback bounces an expired recovery code here.
import { getTranslations } from 'next-intl/server';

import { AuthScaffold } from '@/components/auth/AuthScaffold';
import { ForgotPasswordForm } from '@/components/auth/ForgotPasswordForm';
import { ErrorBanner } from '@/components/auth/fields';
import { Link } from '@/i18n/navigation';

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const t = await getTranslations('Auth');
  const message = error === 'link_expired' ? t('forgotLinkExpired') : undefined;

  return (
    <AuthScaffold
      title={t('forgotTitle')}
      lede={t('forgotLede')}
      footer={
        <>
          {t('rememberedIt')}{' '}
          <Link href="/signin" className="text-foreground hover:text-blue font-semibold">
            {t('signIn')}
          </Link>
        </>
      }
    >
      {message && <ErrorBanner message={message} />}
      <ForgotPasswordForm />
    </AuthScaffold>
  );
}
