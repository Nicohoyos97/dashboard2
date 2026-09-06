// OAuth + recovery return handler: exchanges the PKCE code for a session, then
// redirects to `next`. Used by email confirmation + Google sign-in
// (next=/dashboard or /es/dashboard) and password recovery (next=/reset-password
// or /es/reset-password). This route is NOT localized — the locale travels in
// the `next` param, which keeps a Spanish user in /es on the way back.
import { NextResponse } from 'next/server';

import { isUnprovisioned } from '@/lib/auth/provisioned';
import { safeRedirectPath } from '@/lib/auth/redirect';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const nextParam = url.searchParams.get('next') ?? '/dashboard';
  const next = safeRedirectPath(nextParam) ?? '/dashboard';

  // Build the base from the Host header (respecting the Vercel proxy) so we
  // redirect back to the exact origin the user is on — e.g. 127.0.0.1, not
  // localhost, which would drop the session cookie (different origin).
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  const proto =
    request.headers.get('x-forwarded-proto') ??
    (process.env.NODE_ENV === 'development' ? 'http' : 'https');
  const base = host ? `${proto}://${host}` : url.origin;

  // Derive the locale from `next` so error bounces stay in the user's language.
  const localePrefix = next === '/es' || next.startsWith('/es/') ? '/es' : '';
  const bounce = (reason: string) =>
    NextResponse.redirect(`${base}${localePrefix}/signin?error=${reason}`);

  if (!code) {
    // Supabase sends the user back here with no code when it refuses the
    // sign-in. With sign-ups closed, an unknown Google account is exactly that
    // case, and it deserves the answer that points at the plans.
    return bounce(
      url.searchParams.get('error_code') === 'signup_disabled' ? 'no_account' : 'server_error',
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    // Expired/invalid link. Recovery links route the user back to request a new
    // one; OAuth failures go back to sign-in — in the same locale.
    if (next.includes('/reset-password')) {
      return NextResponse.redirect(`${base}${localePrefix}/forgot-password?error=link_expired`);
    }
    return bounce('server_error');
  }

  if (await isUnprovisioned(supabase, data.user)) {
    await supabase.auth.signOut();
    return bounce('no_account');
  }

  return NextResponse.redirect(`${base}${next}`);
}
