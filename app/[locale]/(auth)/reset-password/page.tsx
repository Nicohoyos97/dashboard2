// Reset-password page: consumes the recovery session established by /callback
// and lets the user set a new password. Without a valid session the link has
// expired, so we point the user back to request a fresh one.
import { getTranslations } from 'next-intl/server';

import { AuthScaffold } from '@/components/auth/AuthScaffold';
import { ResetPasswordForm } from '@/components/auth/ResetPasswordForm';
import { Link } from '@/i18n/navigation';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';

export default async function ResetPasswordPage() {
  const user = await getCurrentUser();
  const t = await getTranslations('Auth');

  if (!user) {
    return (
      <AuthScaffold title={t('resetExpiredTitle')} lede={t('resetExpiredLede')}>
        <div className="border-line bg-paper rounded-[16px] border p-6 text-center">
          <Link
            href="/forgot-password"
            className="text-foreground hover:text-blue text-[14px] font-semibold"
          >
            {t('requestNewLink')}
          </Link>
        </div>
      </AuthScaffold>
    );
  }

  return (
    <AuthScaffold title={t('resetTitle')} lede={t('resetLede')}>
      <ResetPasswordForm />
    </AuthScaffold>
  );
}
