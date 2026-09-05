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

import { COOKIE_OPTIONS, REMEMBER_SESSION_COOKIE, supabaseEnv } from './env';
import type { Database } from './types';

// Taken from getClaims' own signature so it cannot drift from the SDK.
type SupabaseAuth = ReturnType<typeof createServerClient<Database>>['auth'];
type Jwks = NonNullable<NonNullable<Parameters<SupabaseAuth['getClaims']>[1]>['jwks']>;

// The signing keys, cached for the life of the edge isolate.
//
// getClaims() caches the key set on the client instance, and this middleware
// builds a fresh client per request — so without this the auth round trip we
// are removing would simply be replaced by a JWKS round trip. A key we do not
// have (after a rotation) is not a failure: auth-js falls through to its own
// fetch for that one request.
let jwksCache: Jwks | null = null;
let jwksFetchedAt = 0;
const JWKS_TTL_MS = 10 * 60_000;

async function signingKeys(url: string, anonKey: string): Promise<Jwks | undefined> {
  if (jwksCache && jwksFetchedAt + JWKS_TTL_MS > Date.now()) return jwksCache;
  try {
    const res = await fetch(`${url}/auth/v1/.well-known/jwks.json`, {
      headers: { apikey: anonKey },
    });
    if (!res.ok) return jwksCache ?? undefined;
    const body: unknown = await res.json();
    if (typeof body !== 'object' || body === null || !Array.isArray((body as Jwks).keys)) {
      return jwksCache ?? undefined;
    }
    jwksCache = body as Jwks;
    jwksFetchedAt = Date.now();
    return jwksCache;
  } catch {
    // Offline or rate-limited: hand back whatever we have. auth-js fetches for
    // itself when the key is missing, and falls back to getUser() after that.
    return jwksCache ?? undefined;
  }
}

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
  // Resolved before the client exists, so nothing runs between building it and
  // the call below that refreshes the session.
  const jwks = await signingKeys(url, anonKey);
  const sessionOnly = request.cookies.get(REMEMBER_SESSION_COOKIE)?.value === '0';
  const supabase = createServerClient<Database>(url, anonKey, {
    cookieOptions: COOKIE_OPTIONS,
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        cookiesToSet.forEach(({ name, value, options }) => {
          if (!sessionOnly) {
            response.cookies.set(name, value, options);
            return;
          }
          const sessionOptions = { ...options };
          delete sessionOptions.expires;
          delete sessionOptions.maxAge;
          response.cookies.set(name, value, sessionOptions);
        });
      },
    },
  });

  // IMPORTANT: do not run code between createServerClient and this call — it
  // refreshes the session and is what keeps users signed in. getClaims() asks
  // getSession() for the token first, so the refresh still happens; what it
  // drops is getUser()'s round trip to the Auth server, which every edge in the
  // world was paying to reach the project's region on every navigation.
  //
  // This is a navigation guard, and a locally verified token is the right
  // strength for it: the most a revoked session buys is a page view until the
  // token expires. Everything that acts on a session still asks the Auth server
  // — Server Actions that write, the /admin gate, document and export
  // downloads all call getUser() — and RLS is the real control on every query
  // regardless.
  //
  // Local verification needs asymmetric signing keys; this project's JWKS
  // publishes an ES256 key. On a legacy symmetric secret getClaims() falls back
  // to getUser() by itself, so this stays correct either way, just not faster.
  const { data: claims } = await supabase.auth.getClaims(undefined, jwks ? { jwks } : {});
  const signedIn = claims !== null;

  const { pathname } = request.nextUrl;
  const isEs = pathname === '/es' || pathname.startsWith('/es/');
  const bare = isEs ? pathname.replace(/^\/es/, '') || '/' : pathname;

  if (!signedIn && isProtected(bare)) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = isEs ? '/es/signin' : '/signin';
    redirectUrl.searchParams.set('redirectedFrom', pathname);
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}
