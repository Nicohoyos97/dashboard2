// The reader's own language, and where a request has to go for the URL to
// match it.
//
// The preference is carried in the Supabase JWT's `user_metadata`, not looked
// up per request: the middleware already verifies the token locally
// (lib/supabase/middleware.ts), so reading one more claim from it costs
// nothing, where a profiles query would put a database round trip in front of
// every navigation. The firm writes it when it invites a client
// (inviteUserByEmail's `data`), the client changes it in Settings → Profile,
// and `profiles.locale` (0019) keeps the durable copy the firm can see.
import { type Locale, routing } from './routing';

export function isSupportedLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (routing.locales as readonly string[]).includes(value);
}

/** English carries no URL prefix; every other locale does. */
export function localePrefix(locale: string): string {
  return locale === routing.defaultLocale ? '' : `/${locale}`;
}

/** The language a `user_metadata` object asks for, or null when it names none. */
export function localeFromMetadata(metadata: unknown): Locale | null {
  if (typeof metadata !== 'object' || metadata === null) return null;
  const locale = (metadata as { locale?: unknown }).locale;
  return isSupportedLocale(locale) ? locale : null;
}

/** The language a verified token asks for, or null when it names none. */
export function preferredLocale(claims: unknown): Locale | null {
  if (typeof claims !== 'object' || claims === null) return null;
  return localeFromMetadata((claims as { user_metadata?: unknown }).user_metadata);
}

/**
 * Paths that are served as they are written and must never gain a locale
 * prefix: the route handlers under /api and the OAuth / email-confirm return.
 * `middleware.ts` sends these through the session refresh without the next-intl
 * rewrite, so a redirect here would invent `/es/api/chat` — a 404 for every
 * Spanish client's chat, export and download.
 */
export function isLocalizedPath(pathname: string): boolean {
  return !(pathname === '/api' || pathname.startsWith('/api/') || pathname === '/callback');
}

/** The `/es` (or empty) prefix a path currently carries, and the rest of it. */
export function splitLocale(pathname: string): { locale: Locale; rest: string } {
  for (const locale of routing.locales) {
    if (locale === routing.defaultLocale) continue;
    if (pathname === `/${locale}` || pathname.startsWith(`/${locale}/`)) {
      return { locale, rest: pathname.slice(locale.length + 1) || '/' };
    }
  }
  return { locale: routing.defaultLocale, rest: pathname };
}

/**
 * Where this request should go so the page comes back in the reader's
 * language, or null when it is already right.
 *
 * Idempotent by construction: the returned path carries the preferred prefix,
 * so the next request agrees and nothing redirects again.
 */
export function localeRedirectPath(pathname: string, preferred: Locale | null): string | null {
  if (preferred === null || !isLocalizedPath(pathname)) return null;
  const { locale, rest } = splitLocale(pathname);
  if (locale === preferred) return null;
  return preferred === routing.defaultLocale ? rest : `/${preferred}${rest === '/' ? '' : rest}`;
}
