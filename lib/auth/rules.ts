// The auth forms' rules, with no validation library in them.
//
// The forms check these in the browser (react-hook-form's own `validate`), and
// the zod schemas in ./schemas — which the Server Actions run, and which stay
// the authority — are built from the same values, so the two cannot drift.
// Keeping zod and its resolver out of the forms took ~28 kB off sign-in, the
// first page every session opens.
//
// Every failure is an `AuthIssue`, a key of the `Auth` namespace, so the
// reader sees it in their own language: the schemas used to carry English
// sentences, and the portal printed them to Spanish readers as they were.

/** The pattern z.email() applies by default (zod/v4/core/regexes.ts), so the browser and the server accept the same addresses. */
export const EMAIL_PATTERN = /^(?!\.)(?!.*\.\.)([A-Za-z0-9_'+\-.]*)[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9-]*\.)+[A-Za-z]{2,}$/;

/** docs/SECURITY.md and supabase/config.toml: at least 8, with a lowercase, an uppercase, a digit and a symbol. */
export const PASSWORD_MIN = 8;

export const PASSWORD_RULES = [
  { issue: 'passwordLower', pattern: /[a-z]/ },
  { issue: 'passwordUpper', pattern: /[A-Z]/ },
  { issue: 'passwordDigit', pattern: /[0-9]/ },
  { issue: 'passwordSymbol', pattern: /[^A-Za-z0-9]/ },
] as const;

export const AUTH_ISSUES = [
  'emailInvalid',
  'passwordRequired',
  'passwordTooShort',
  'passwordLower',
  'passwordUpper',
  'passwordDigit',
  'passwordSymbol',
  'confirmRequired',
  'passwordMismatch',
] as const;

export type AuthIssue = (typeof AUTH_ISSUES)[number];

export function isAuthIssue(value: unknown): value is AuthIssue {
  return typeof value === 'string' && (AUTH_ISSUES as readonly string[]).includes(value);
}

export function emailIssue(value: string): AuthIssue | null {
  return EMAIL_PATTERN.test(value) ? null : 'emailInvalid';
}

/** The first rule the password breaks, in the order the schema checks them. */
export function passwordIssue(value: string): AuthIssue | null {
  if (value.length < PASSWORD_MIN) return 'passwordTooShort';
  return PASSWORD_RULES.find((rule) => !rule.pattern.test(value))?.issue ?? null;
}

/** Shared 0–4 password strength score for the invite and reset meters. */
export function passwordStrength(value: string): number {
  if (!value || value.length < PASSWORD_MIN) return 0;
  return PASSWORD_RULES.filter((rule) => rule.pattern.test(value)).length;
}
