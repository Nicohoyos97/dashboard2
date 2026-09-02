'use client';

// TOTP enroll / verify, driven by the browser Supabase client (the only client
// that can enroll a factor for the signed-in user — same pattern as the avatar
// upload). After a successful verify the session cookie carries aal = 'aal2'
// and router.refresh() lets the server layouts see it.
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';

import { createClient } from '@/lib/supabase/client';

type Enrollment = { factorId: string; qrCode: string; secret: string };

export function MfaGate({
  mode,
  factorId,
  nextPath,
}: {
  mode: 'enroll' | 'verify';
  factorId: string | null;
  nextPath: string;
}) {
  const t = useTranslations('Mfa');
  const router = useRouter();
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (mode !== 'enroll') return;
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      // Abandoned enrollments leave unverified factors behind; clear them so
      // the account never accumulates dead factors.
      const { data: factors } = await supabase.auth.mfa.listFactors();
      for (const f of factors?.totp ?? []) {
        if (f.status !== 'verified') await supabase.auth.mfa.unenroll({ factorId: f.id });
      }
      const { data, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'Authenticator app',
      });
      if (cancelled) return;
      if (enrollError || !data) return setError(t('enrollFailed'));
      setEnrollment({ factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret });
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, t]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const id = mode === 'enroll' ? enrollment?.factorId : factorId;
    if (!id || code.length !== 6) return setError(t('codeInvalid'));

    startTransition(async () => {
      const supabase = createClient();
      const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({
        factorId: id,
        code,
      });
      if (verifyError) return setError(t('codeInvalid'));
      router.replace(nextPath);
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="mt-6">
      {mode === 'enroll' && (
        <div className="border-line bg-paper rounded-xl border p-4">
          {enrollment ? (
            <>
              {/* Supabase returns the QR as an SVG data URL; nothing to fetch. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={enrollment.qrCode}
                alt={t('qrAlt')}
                width={176}
                height={176}
                className="mx-auto size-44 rounded-lg bg-white p-2"
              />
              <p className="text-muted-foreground mt-3 text-center text-[12.5px]">
                {t('secretHint')}
              </p>
              <code className="text-ink mt-1 block text-center text-[12.5px] break-all select-all">
                {enrollment.secret}
              </code>
            </>
          ) : (
            <p className="text-muted-foreground text-center text-[13.5px]">{t('preparing')}</p>
          )}
        </div>
      )}

      <label htmlFor="totp" className="text-ink mt-5 block text-[14px] font-semibold">
        {t('codeLabel')}
      </label>
      <input
        id="totp"
        name="totp"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]{6}"
        maxLength={6}
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
        className="border-line bg-card text-ink focus:border-blue mt-1.5 h-12 w-full rounded-xl border px-4 text-center text-[20px] tracking-[0.4em] outline-none focus:shadow-[0_0_0_4px_rgba(37,99,235,0.12)]"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? 'totp-error' : undefined}
      />
      {error && (
        <p id="totp-error" role="alert" className="text-danger mt-2 text-[13px]">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending || (mode === 'enroll' && !enrollment)}
        className="bg-blue hover:bg-blue-soft mt-5 h-11 w-full rounded-xl text-[14.5px] font-semibold text-white transition disabled:opacity-60"
      >
        {isPending ? t('verifying') : mode === 'enroll' ? t('enrollCta') : t('verifyCta')}
      </button>
    </form>
  );
}
