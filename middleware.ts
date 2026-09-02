// Root middleware: composes next-intl locale routing with the Supabase session
// refresh + auth guard. Order matters — next-intl resolves the locale FIRST so
// the guard can redirect to the sign-in page of the correct locale.
import createMiddleware from 'next-intl/middleware';
import { type NextRequest, NextResponse } from 'next/server';

import { routing } from '@/i18n/routing';
import { updateSession } from '@/lib/supabase/middleware';

const handleI18n = createMiddleware(routing);

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // API routes and the OAuth/email callback are NOT localized — they only need
  // the session refresh, no locale rewrite.
  if (pathname.startsWith('/api') || pathname === '/callback') {
    return updateSession(request, NextResponse.next({ request }));
  }

  // 1) next-intl resolves the locale and produces its response (a rewrite to the
  //    [locale] segment, or a normalization redirect).
  const intlResponse = handleI18n(request);

  // 2) If next-intl decided to redirect (URL normalization), honor it as-is.
  if (intlResponse.headers.get('location')) return intlResponse;

  // 3) Refresh the session (cookies merged into the intl response) and apply the
  //    locale-aware guard.
  return updateSession(request, intlResponse);
}

export const config = {
  // Run on everything except Next internals and static assets.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
