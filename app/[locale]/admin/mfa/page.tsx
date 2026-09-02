// TOTP gate for firm users (INITIAL_PROMPT.md §3, §8). Reachable at aal1 (the
// root admin layout only checks the firm membership). Enroll when the account
// has no verified TOTP factor yet; otherwise verify a code for this session.
// Already at aal2 → straight to /admin.
import { getLocale, getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';

import { MfaGate } from '@/components/admin/MfaGate';
import { getAssuranceLevel } from '@/lib/auth/getAssuranceLevel';
import { createClient } from '@/lib/supabase/server';

export default async function AdminMfaPage() {
  const [level, locale, t] = await Promise.all([
    getAssuranceLevel(),
    getLocale(),
    getTranslations('Mfa'),
  ]);
  const prefix = locale === 'en' ? '' : `/${locale}`;
  if (level === 'aal2') redirect(`${prefix}/admin`);

  const supabase = await createClient();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const verified = factors?.totp.find((f) => f.status === 'verified');
  const mode = verified ? 'verify' : 'enroll';

  return (
    <main className="bg-paper flex min-h-screen items-center justify-center px-6 py-12">
      <div className="border-line bg-card w-full max-w-[440px] rounded-2xl border p-8 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <p className="text-muted-foreground text-[11px] font-semibold tracking-[0.12em] uppercase">
          {t('eyebrow')}
        </p>
        <h1 className="text-ink mt-2 text-[24px] font-bold tracking-[-0.01em]">
          {mode === 'enroll' ? t('enrollTitle') : t('verifyTitle')}
        </h1>
        <p className="text-muted-foreground mt-1.5 text-[14.5px] leading-[1.5]">
          {mode === 'enroll' ? t('enrollLede') : t('verifyLede')}
        </p>
        <MfaGate mode={mode} factorId={verified?.id ?? null} nextPath={`${prefix}/admin`} />
      </div>
    </main>
  );
}
