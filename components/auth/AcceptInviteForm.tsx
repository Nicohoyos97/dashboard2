'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useEffect, useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { Link, useRouter } from '@/i18n/navigation';
import { passwordSchema } from '@/lib/auth/schemas';
import { createClient } from '@/lib/supabase/client';

import { ErrorBanner, PasswordField, Spinner, StrengthMeter } from './fields';

const schema = z.object({ password: passwordSchema });
type Values = z.infer<typeof schema>;
type State = 'loading' | 'ready' | 'invalid';

// Invite acceptance: the browser client picks the session up from the invite
// link's URL fragment; the user then sets a password and continues.
export function AcceptInviteForm() {
  const t = useTranslations('Auth');
  const router = useRouter();
  const [state, setState] = useState<State>('loading');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(schema), mode: 'onBlur' });

  useEffect(() => {
    // The invite link (generated server-side, so no PKCE verifier) lands with
    // the tokens in the URL fragment. The browser client does not consume it
    // on its own, so read it explicitly, install the session (which writes the
    // auth cookies the server needs), and scrub the fragment from history.
    const supabase = createClient();
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const accessToken = hash.get('access_token');
    const refreshToken = hash.get('refresh_token');
    if (!accessToken || !refreshToken) {
      supabase.auth.getSession().then(({ data }) => setState(data.session ? 'ready' : 'invalid'));
      return;
    }
    supabase.auth
      .setSession({ access_token: accessToken, refresh_token: refreshToken })
      .then(({ data }) => {
        window.history.replaceState(null, '', window.location.pathname);
        setState(data.session ? 'ready' : 'invalid');
      });
  }, []);

  const onSubmit = handleSubmit((values) => {
    setError(null);
    startTransition(async () => {
      const { error: updateError } = await createClient().auth.updateUser({
        password: values.password,
      });
      if (updateError) return setError(t('inviteFailed'));
      router.replace('/dashboard');
      router.refresh();
    });
  });

  if (state === 'loading') {
    return (
      <p className="text-muted-foreground flex items-center gap-2 text-[14px]">
        <Spinner />
        {t('inviteChecking')}
      </p>
    );
  }

  if (state === 'invalid') {
    return (
      <div className="border-line bg-secondary rounded-[12px] border px-4 py-3 text-[14px]">
        <p className="text-ink font-semibold">{t('inviteInvalidTitle')}</p>
        <p className="text-muted-foreground mt-1">{t('inviteInvalidBody')}</p>
        <Link href="/signin" className="text-blue mt-3 inline-block font-semibold">
          {t('signIn')}
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col">
      {error && <ErrorBanner message={error} />}
      <PasswordField
        id="password"
        label={t('newPassword')}
        autoComplete="new-password"
        error={errors.password?.message}
        registration={register('password')}
      />
      <StrengthMeter value={watch('password') ?? ''} />
      <button
        type="submit"
        disabled={isPending}
        className="bg-blue hover:bg-blue-soft mt-2 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full px-6 text-[15px] font-semibold text-white transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending ? <Spinner /> : t('inviteCta')}
      </button>
    </form>
  );
}
