// Session-refresh + locale-aware route-guard helper called from the root
// middleware. Follows the @supabase/ssr Next.js pattern: refresh the auth cookie
// on every request, then redirect unauthenticated users away from protected
// routes — to the sign-in page of the SAME locale.
//
// `response` is the response produced by the next-intl middleware (a locale
// rewrite); we write Supabase's refreshed cookies onto it so locale routing and
// session refresh coexist in one response.
import { createServerClient } from '@supabase/ssr';
import { type NextRequest, NextResponse } from 'next/server';

import { COOKIE_OPTIONS, supabaseEnv } from './env';
import type { Database } from './types';

// Protected route groups. Checked against the locale-stripped path, so
// /es/dashboard is guarded exactly like /dashboard.
const PROTECTED_PREFIXES = [
  '/dashboard',
  '/statements',
  '/expenses',
  '/taxes',
  '/chat',
  '/settings',
  '/admin',
];

function isProtected(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export async function updateSession(
  request: NextRequest,
  response: NextResponse,
): Promise<NextResponse> {
  const { url, anonKey } = supabaseEnv();
  const supabase = createServerClient<Database>(url, anonKey, {
    cookieOptions: COOKIE_OPTIONS,
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  // IMPORTANT: do not run code between createServerClient and getUser() — it
  // refreshes the session and is what keeps users signed in. getUser() runs on
  // every (non-API) request, so the guard below can never be skipped.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isEs = pathname === '/es' || pathname.startsWith('/es/');
  const bare = isEs ? pathname.replace(/^\/es/, '') || '/' : pathname;

  if (!user && isProtected(bare)) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = isEs ? '/es/signin' : '/signin';
    redirectUrl.searchParams.set('redirectedFrom', pathname);
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}
