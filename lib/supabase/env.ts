// Validated Supabase public env. Static dotted access so Next.js inlines the
// NEXT_PUBLIC_* values at build time (a dynamic process.env[name] would not be
// inlined client-side). Throws a clear error instead of leaking `undefined`.
export function supabaseEnv(): { url: string; anonKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY — check .env.local',
    );
  }
  return { url, anonKey };
}

// Cookie attributes for the Supabase auth cookies. @supabase/ssr defaults to
// sameSite='lax' but never sets `secure`, so we add it: HTTPS-only in
// production, off locally (http://127.0.0.1). httpOnly stays false by design —
// the browser client reads the session via document.cookie, which cannot
// access HttpOnly cookies; security relies on short-lived (1h) rotated tokens.
export const COOKIE_OPTIONS = {
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
};

export const REMEMBER_SESSION_COOKIE = 'hb_remember';
