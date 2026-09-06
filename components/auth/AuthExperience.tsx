'use client';

import { useLocale, useTranslations } from 'next-intl';
import Image from 'next/image';
import { useState } from 'react';

import { Link } from '@/i18n/navigation';
import { getStartedUrl } from '@/lib/auth/get-started';

import { AuthForm } from './AuthForm';
import { AuthSplit } from './AuthSplit';
import { SocialRow } from './SocialRow';

// Sign-in, and only sign-in. Accounts are not self-serve — see
// lib/auth/get-started.ts — so the way out for a visitor with no account is a
// link to the plans, not a second mode of this screen.
export function AuthExperience({
  redirectTo,
  initialError,
}: {
  redirectTo?: string | undefined;
  initialError?: string | undefined;
}) {
  const t = useTranslations('Auth');
  const locale = useLocale();
  const [error, setError] = useState<string | null>(initialError ?? null);

  return (
    <AuthSplit>
      <Image
        src="/brand/logo-wordmark.png"
        alt="Hoyos Baker"
        width={64}
        height={64}
        priority
        className="mx-auto mb-5 size-16 rounded-full"
      />

      <h1 className="text-ink text-center text-[34px] leading-tight font-bold tracking-[-0.025em]">
        {t('signinTitle')}
      </h1>
      <p className="text-muted-foreground mt-2 text-center text-[15px] leading-relaxed">
        {t('signinLede')}
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

      <div className="mt-6">
        <SocialRow redirectTo={redirectTo} onError={setError} />
      </div>

      <div className="text-muted-foreground before:bg-line after:bg-line my-6 flex items-center gap-4 text-[12px] font-medium tracking-[0.12em] uppercase before:h-px before:flex-1 after:h-px after:flex-1">
        {t('orWithEmail')}
      </div>

      <AuthForm redirectTo={redirectTo} onError={setError} />

      {/* Out of the app and onto the marketing site's plans, so it is a plain
          <a>: no locale prefix of ours, no client router. */}
      <p className="text-muted-foreground mt-6 text-center text-[13.5px]">
        {t('noAccount')}{' '}
        <a
          href={getStartedUrl(locale)}
          className="text-blue font-semibold underline-offset-4 hover:underline"
        >
          {t('getStarted')}
        </a>
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
