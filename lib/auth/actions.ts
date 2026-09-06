'use server';

import { getLocale, getTranslations } from 'next-intl/server';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { localeFromMetadata, localePrefix } from '@/i18n/preference';
import { safeRedirectPath } from '@/lib/auth/redirect';
import { createClient } from '@/lib/supabase/server';
import { COOKIE_OPTIONS, REMEMBER_SESSION_COOKIE } from '@/lib/supabase/env';

import { type SignInValues, forgotPasswordSchema, passwordSchema, signInSchema } from './schemas';

// Discriminated result returned to the client form. Never leak provider error
// details that would aid account enumeration.
export type AuthResult = { ok: true; url?: string } | { ok: false; error: string };

async function getOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host');
  const proto = h.get('x-forwarded-proto') ?? 'http';
  if (host) return `${proto}://${host}`;
  return process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
}

// Prefix a locale-agnostic app path with the active locale (English = no prefix).
// Used for redirects + the callback `next` param so a Spanish user stays in /es.
async function localePath(path: string): Promise<string> {
  const locale = await getLocale();
  return locale === 'en' ? path : `/${locale}${path}`;
}

export async function signInWithPassword(
  values: SignInValues,
  redirectTo?: string,
): Promise<AuthResult> {
  const t = await getTranslations('AuthErrors');
  const parsed = signInSchema.safeParse(values);
  if (!parsed.success) return { ok: false, error: t('checkDetails') };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  // Do not differentiate wrong-password from unknown-email (enumeration).
  if (error) return { ok: false, error: t('invalidCredentials') };

  const remember = parsed.data.remember ?? true;
  const cookieStore = await cookies();
  const sharedOptions = { ...COOKIE_OPTIONS, path: '/' };
  cookieStore.set(
    REMEMBER_SESSION_COOKIE,
    remember ? '1' : '0',
    remember ? { ...sharedOptions, maxAge: 60 * 60 * 24 * 365 } : sharedOptions,
  );
  if (!remember) {
    // Supabase may have written persistent auth cookies during sign-in. Write
    // the same values once more without an expiry to make them session-only.
    for (const cookie of cookieStore.getAll()) {
      if (cookie.name.startsWith('sb-')) cookieStore.set(cookie.name, cookie.value, sharedOptions);
    }
  }

  // Land them in their own language, not the one the sign-in page happened to
  // be in: a Spanish client who follows an English link would otherwise be
  // redirected a second time by the middleware, and Next leaves the address bar
  // on the old path when that happens mid-Server-Action — Spanish content at an
  // English URL. `redirectTo` (from the guard's redirectedFrom) is already
  // locale-prefixed and names where they were actually going, so it wins.
  const preferred = localeFromMetadata(data.user?.user_metadata);
  redirect(
    safeRedirectPath(redirectTo) ??
      (preferred ? `${localePrefix(preferred)}/dashboard` : await localePath('/dashboard')),
  );
}

export async function signInWithGoogle(redirectTo?: string): Promise<AuthResult> {
  const t = await getTranslations('AuthErrors');
  const supabase = await createClient();
  const origin = await getOrigin();
  const next = safeRedirectPath(redirectTo) ?? (await localePath('/dashboard'));

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${origin}/callback?next=${encodeURIComponent(next)}` },
  });

  if (error || !data.url) {
    return { ok: false, error: t('googleFailed') };
  }
  return { ok: true, url: data.url };
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect(await localePath('/signin'));
}

export async function requestPasswordReset(email: string): Promise<AuthResult> {
  const t = await getTranslations('AuthErrors');
  const parsed = forgotPasswordSchema.safeParse({ email });
  if (!parsed.success) return { ok: false, error: t('checkDetails') };

  const supabase = await createClient();
  const origin = await getOrigin();
  const next = await localePath('/reset-password');
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${origin}/callback?next=${encodeURIComponent(next)}`,
  });

  // Always report success — never reveal whether an account exists.
  return { ok: true };
}

export async function updatePassword(password: string): Promise<AuthResult> {
  const t = await getTranslations('AuthErrors');
  const parsed = passwordSchema.safeParse(password);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? t('checkDetails') };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // Reaching reset-password requires an active recovery session from /callback.
  if (!user) return { ok: false, error: t('serverError') };

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    // Supabase's own messages (e.g. same_password, weak password) are passed
    // through untranslated for now — see the i18n follow-up note in the PR.
    if (error.message.toLowerCase().includes('password')) {
      return { ok: false, error: error.message };
    }
    return { ok: false, error: t('serverError') };
  }

  redirect(await localePath('/dashboard'));
}
