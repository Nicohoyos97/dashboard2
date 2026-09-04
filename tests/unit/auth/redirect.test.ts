import { describe, expect, it } from 'vitest';

import { safeRedirectPath } from '@/lib/auth/redirect';

describe('safeRedirectPath', () => {
  it('keeps an in-app path, with its query and hash', () => {
    expect(safeRedirectPath('/dashboard')).toBe('/dashboard');
    expect(safeRedirectPath('/es/settings/privacy')).toBe('/es/settings/privacy');
    expect(safeRedirectPath('/expenses?period=2026-Q1#top')).toBe('/expenses?period=2026-Q1#top');
  });

  it('refuses a protocol-relative URL disguised as a path', () => {
    // The bug this guard exists for: "//evil.com".startsWith('/') is true, and
    // the browser resolves it against the current scheme — off-origin.
    expect(safeRedirectPath('//evil.com')).toBeNull();
    expect(safeRedirectPath('//evil.com/signin')).toBeNull();
    // A backslash is a slash to every browser's URL parser.
    expect(safeRedirectPath('/\\evil.com')).toBeNull();
    expect(safeRedirectPath('/\\/evil.com')).toBeNull();
  });

  it('refuses a path that smuggles a leading slash through a stripped control character', () => {
    // Browsers remove tab, LF and CR from a URL before resolving it, so each of
    // these becomes "//evil.com" in the address bar.
    expect(safeRedirectPath('/\t/evil.com')).toBeNull();
    expect(safeRedirectPath('/\n/evil.com')).toBeNull();
    expect(safeRedirectPath('/\r/evil.com')).toBeNull();
    expect(safeRedirectPath('/\t\n/\revil.com')).toBeNull();
  });

  it('refuses anything that is not a path', () => {
    expect(safeRedirectPath('https://evil.com')).toBeNull();
    expect(safeRedirectPath('javascript:alert(1)')).toBeNull();
    expect(safeRedirectPath('evil.com')).toBeNull();
    expect(safeRedirectPath('')).toBeNull();
    expect(safeRedirectPath(undefined)).toBeNull();
    expect(safeRedirectPath(null)).toBeNull();
  });

  it('returns the control-stripped path, which is what the browser would resolve', () => {
    expect(safeRedirectPath('/dash\nboard')).toBe('/dashboard');
  });
});
