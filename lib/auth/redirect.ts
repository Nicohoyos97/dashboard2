// Where a successful sign-in may send the browser. The value arrives as the
// `redirectedFrom` search param, so it is attacker-controlled: a bare
// `startsWith('/')` is not an origin check, because `//evil.com` also starts
// with a slash and every browser resolves it against the current scheme.
//
// Kept out of `actions.ts` so it stays a pure function with its own unit test —
// that file is `'use server'` and cannot be imported by the suite.

// Browsers strip tab, LF and CR from a URL before resolving it, so a candidate
// carrying them can smuggle a leading `//` past a prefix check. Normalize first,
// then validate what the browser would actually see.
const STRIPPED_BY_BROWSERS = /[\t\n\r]/g;

/**
 * The path to redirect to, or null when the candidate is not a safe in-app
 * path. Callers fall back to their own default rather than trusting the input.
 */
export function safeRedirectPath(candidate: string | null | undefined): string | null {
  if (!candidate) return null;
  const path = candidate.replace(STRIPPED_BY_BROWSERS, '');
  if (!path.startsWith('/')) return null;
  // `//host` and `/\host` are protocol-relative: same-origin only in appearance.
  if (path.startsWith('//') || path.startsWith('/\\')) return null;
  return path;
}
