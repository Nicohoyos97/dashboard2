// Root middleware: composes next-intl locale routing with the Supabase session
// refresh + auth guard. Order matters — next-intl resolves the locale FIRST so
// the guard can redirect to the sign-in page of the correct locale.
import createMiddleware from 'next-intl/middleware';
import { type NextRequest, NextResponse } from 'next/server';

import { routing } from '@/i18n/routing';
import { updateSession } from '@/lib/supabase/middleware';

const handleI18n = createMiddleware(routing);

export async function middleware(request: NextRequest) {
  try {
    const { pathname } = request.nextUrl;

    // API routes and the OAuth/email callback are NOT localized — they only need
    // the session refresh, no locale rewrite.
    if (pathname.startsWith('/api') || pathname === '/callback') {
      return await updateSession(request, NextResponse.next({ request }));
    }

    // 1) next-intl resolves the locale and produces its response (a rewrite to the
    //    [locale] segment, or a normalization redirect).
    const intlResponse = handleI18n(request);

    // 2) If next-intl decided to redirect (URL normalization), honor it as-is.
    if (intlResponse.headers.get('location')) return intlResponse;

    // 3) Refresh the session (cookies merged into the intl response) and apply the
    //    locale-aware guard.
    return await updateSession(request, intlResponse);
  } catch (error) {
    return unavailable(error);
  }
}

/**
 * Every request passes through here, so an exception takes the whole domain
 * down as an opaque platform 500 with nothing in it for whoever has to fix it
 * (Vercel reports `MIDDLEWARE_INVOCATION_FAILED`). Fail closed and legibly
 * instead: no page is ever served without its session having been resolved,
 * and the response names which half is wrong — configuration or the auth
 * service — so a misconfigured deploy is diagnosable from a single curl.
 */
function unavailable(error: unknown): NextResponse {
  const message = error instanceof Error ? error.message : 'unknown error';
  const misconfigured = message.startsWith('Missing NEXT_PUBLIC_SUPABASE');
  const code = misconfigured ? 'supabase_env_missing' : 'auth_unavailable';
  // Operator log only (Vercel runtime logs): env names and the public Supabase
  // URL, never a key, a session or anything about the user.
  console.error(`[middleware] ${code}: ${message}`);
  return new NextResponse(
    `Service unavailable (${code}). The portal cannot verify sessions right now, so nothing is served. ` +
      (misconfigured
        ? 'Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in the deployment environment and redeploy.'
        : 'The authentication service did not answer.'),
    {
      status: 503,
      headers: { 'content-type': 'text/plain; charset=utf-8', 'retry-after': '30', 'cache-control': 'no-store' },
    },
  );
}

export const config = {
  // Run on everything except Next internals, static assets and the crawler
  // files, which are served as-is and must not be locale-rewritten.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
