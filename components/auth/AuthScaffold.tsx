// Shared auth layout for the forgot/reset password pages — same card + visual
// panel as the sign-in screen (via AuthSplit), without duplicating the chrome.
import { useTranslations } from 'next-intl';

import { Link } from '@/i18n/navigation';

import { AuthSplit } from './AuthSplit';

export function AuthScaffold({
  title,
  lede,
  children,
  footer,
}: {
  title: React.ReactNode;
  lede: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const t = useTranslations('Auth');
  return (
    <AuthSplit>
      <Link
        href="/signin"
        className="text-muted-foreground hover:text-blue mb-8 inline-flex items-center gap-1.5 text-[14px] font-semibold transition-colors"
      >
        <BackArrow />
        {t('backToSignIn')}
      </Link>

      <h1 className="text-ink text-[32px] leading-tight font-bold tracking-[-0.01em]">{title}</h1>
      <p className="text-muted-foreground mt-1.5 mb-6 text-[16px] leading-[1.5]">{lede}</p>

      {children}

      {footer && <p className="text-muted-foreground mt-5 text-[14px]">{footer}</p>}

      <footer className="border-line text-muted-foreground mt-10 flex flex-wrap justify-center gap-6 border-t pt-8 text-[12px] font-medium">
        <Link href="/privacy" className="hover:text-blue transition-colors">
          {t('footerPrivacy')}
        </Link>
        <Link href="/terms" className="hover:text-blue transition-colors">
          {t('footerTerms')}
        </Link>
        <Link href="/security" className="hover:text-blue transition-colors">
          {t('footerSecurity')}
        </Link>
      </footer>
    </AuthSplit>
  );
}

function BackArrow() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-[18px]"
      aria-hidden="true"
    >
      <path d="M19 12H5M12 19l-7-7 7-7" />
    </svg>
  );
}
