// OAuth + recovery return handler: exchanges the PKCE code for a session, then
// redirects to `next`. Used by email confirmation + Google sign-in
// (next=/dashboard or /es/dashboard) and password recovery (next=/reset-password
// or /es/reset-password). This route is NOT localized — the locale travels in
// the `next` param, which keeps a Spanish user in /es on the way back.
import { NextResponse } from 'next/server';

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

  if (!code) {
    return NextResponse.redirect(`${base}${localePrefix}/signin?error=server_error`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    // Expired/invalid link. Recovery links route the user back to request a new
    // one; OAuth failures go back to sign-in — in the same locale.
    const dest = next.includes('/reset-password')
      ? `${base}${localePrefix}/forgot-password?error=link_expired`
      : `${base}${localePrefix}/signin?error=server_error`;
    return NextResponse.redirect(dest);
  }

  return NextResponse.redirect(`${base}${next}`);
}
