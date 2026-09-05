// @vitest-environment node
import { describe, expect, it } from 'vitest';

import {
  isLocalizedPath,
  isSupportedLocale,
  localeRedirectPath,
  preferredLocale,
  splitLocale,
} from '@/i18n/preference';

describe('preferredLocale', () => {
  it('reads the language the firm set when it invited the client', () => {
    expect(preferredLocale({ sub: 'u1', user_metadata: { locale: 'es' } })).toBe('es');
    expect(preferredLocale({ sub: 'u1', user_metadata: { locale: 'en' } })).toBe('en');
  });

  it('names none for a token that carries none, or carries nonsense', () => {
    // Every account that predates 0019 is this case, and must be left alone
    // rather than pushed to a default language it never chose.
    expect(preferredLocale({ sub: 'u1' })).toBeNull();
    expect(preferredLocale({ sub: 'u1', user_metadata: {} })).toBeNull();
    expect(preferredLocale({ sub: 'u1', user_metadata: { locale: 'fr' } })).toBeNull();
    expect(preferredLocale({ sub: 'u1', user_metadata: { locale: 42 } })).toBeNull();
    expect(preferredLocale({ user_metadata: null })).toBeNull();
    expect(preferredLocale(null)).toBeNull();
    expect(preferredLocale('nonsense')).toBeNull();
  });
});

describe('splitLocale', () => {
  it('separates the prefix from the path it decorates', () => {
    expect(splitLocale('/es/dashboard')).toEqual({ locale: 'es', rest: '/dashboard' });
    expect(splitLocale('/es')).toEqual({ locale: 'es', rest: '/' });
    expect(splitLocale('/dashboard')).toEqual({ locale: 'en', rest: '/dashboard' });
    expect(splitLocale('/')).toEqual({ locale: 'en', rest: '/' });
  });

  it('does not mistake a path that merely starts with the letters', () => {
    expect(splitLocale('/estimates')).toEqual({ locale: 'en', rest: '/estimates' });
  });
});

describe('localeRedirectPath', () => {
  it('sends a Spanish reader to the Spanish URL', () => {
    expect(localeRedirectPath('/dashboard', 'es')).toBe('/es/dashboard');
    expect(localeRedirectPath('/', 'es')).toBe('/es');
  });

  it('sends an English reader back off the prefix', () => {
    expect(localeRedirectPath('/es/dashboard', 'en')).toBe('/dashboard');
    expect(localeRedirectPath('/es', 'en')).toBe('/');
  });

  it('is idempotent — the destination never redirects again', () => {
    // This runs in the middleware on every request, so a path that still
    // disagreed with itself would be an infinite loop, not a cosmetic bug.
    for (const path of ['/', '/dashboard', '/es', '/es/statements/profit-and-loss']) {
      for (const preferred of ['en', 'es'] as const) {
        const once = localeRedirectPath(path, preferred);
        if (once !== null) expect(localeRedirectPath(once, preferred)).toBeNull();
      }
    }
  });

  it('leaves a reader with no preference exactly where they are', () => {
    expect(localeRedirectPath('/dashboard', null)).toBeNull();
    expect(localeRedirectPath('/es/dashboard', null)).toBeNull();
  });

  it('does nothing when the URL already matches', () => {
    expect(localeRedirectPath('/es/dashboard', 'es')).toBeNull();
    expect(localeRedirectPath('/dashboard', 'en')).toBeNull();
  });

  it('never touches a route that is not localized', () => {
    // middleware.ts runs the session refresh on /api and /callback WITHOUT the
    // next-intl rewrite. Prefixing them would point Nick's stream, every
    // export and the OAuth return at URLs that do not exist — for Spanish
    // clients only, which is the kind of break that ships.
    for (const path of ['/api/chat', '/api/reports/x/pdf', '/api', '/callback']) {
      expect(localeRedirectPath(path, 'es'), path).toBeNull();
      expect(isLocalizedPath(path), path).toBe(false);
    }
  });

  it('still localizes a page whose name merely starts with those letters', () => {
    expect(isLocalizedPath('/apidocs')).toBe(true);
    expect(isLocalizedPath('/callbacks')).toBe(true);
    expect(localeRedirectPath('/apidocs', 'es')).toBe('/es/apidocs');
  });
});

describe('isSupportedLocale', () => {
  it('accepts only the locales this app actually serves', () => {
    expect(isSupportedLocale('en')).toBe(true);
    expect(isSupportedLocale('es')).toBe(true);
    expect(isSupportedLocale('pt')).toBe(false);
    expect(isSupportedLocale(null)).toBe(false);
    expect(isSupportedLocale(undefined)).toBe(false);
  });
});
