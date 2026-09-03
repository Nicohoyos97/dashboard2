'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';

import { Link } from '@/i18n/navigation';

import { AuthForm } from './AuthForm';
import { AuthSplit } from './AuthSplit';
import { SocialRow } from './SocialRow';

type Mode = 'signin' | 'signup';

export function AuthExperience({
  initialMode,
  redirectTo,
  initialError,
}: {
  initialMode: Mode;
  redirectTo?: string | undefined;
  initialError?: string | undefined;
}) {
  const t = useTranslations('Auth');
  const mode = initialMode;
  const isSignup = mode === 'signup';
  const [error, setError] = useState<string | null>(initialError ?? null);

  return (
    <AuthSplit>
      <div className="border-line bg-blue-pale text-blue mb-5 inline-flex size-11 items-center justify-center rounded-[14px] border">
        <ShieldCheck className="size-5" aria-hidden="true" />
      </div>

      <h1 className="text-ink text-[34px] leading-tight font-bold tracking-[-0.025em]">
        {isSignup ? t('signupTitle') : t('signinTitle')}
      </h1>
      <p className="text-muted-foreground mt-2 text-[15px] leading-relaxed">
        {isSignup ? t('signupLede') : t('signinLede')}
      </p>

      {error && (
        <div
          role="alert"
          className="mt-6 flex items-start justify-between gap-3 rounded-[12px] border border-[rgba(239,68,68,0.3)] bg-[rgba(239,68,68,0.06)] px-4 py-3 text-[13.5px] text-danger"
        >
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            aria-label={t('dismiss')}
            className="shrink-0 font-semibold opacity-70 transition hover:opacity-100"
          >
            ✕
          </button>
        </div>
      )}

      <AuthForm key={mode} mode={mode} redirectTo={redirectTo} onError={setError} />

      <div className="text-muted-foreground before:bg-line after:bg-line my-6 flex items-center gap-4 text-[12px] font-medium tracking-[0.12em] uppercase before:h-px before:flex-1 after:h-px after:flex-1">
        {t('orContinueWith')}
      </div>

      <SocialRow redirectTo={redirectTo} onError={setError} />

      <p className="text-muted-foreground mt-6 text-center text-[13.5px]">
        {isSignup ? t('haveAccount') : t('noAccount')}{' '}
        <Link
          href={isSignup ? '/signin' : '/signup'}
          className="text-blue font-semibold underline-offset-4 hover:underline"
        >
          {isSignup ? t('signIn') : t('createAccount')}
        </Link>
      </p>

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
