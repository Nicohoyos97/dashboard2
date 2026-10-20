// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { AUTH_ISSUES, EMAIL_PATTERN, emailIssue, passwordIssue, passwordStrength } from '@/lib/auth/rules';
import { passwordSchema, resetPasswordSchema, signInSchema } from '@/lib/auth/schemas';

import en from '../../../messages/en.json';
import es from '../../../messages/es.json';

// The auth forms check lib/auth/rules in the browser and the Server Actions run
// the zod schemas; these hold the two to the same answers, so a form can never
// let through what the action refuses, or refuse what it would accept.
const EMAILS = [
  'owner@cafe.com',
  'first.last+tag@sub.example.co',
  "o'brien@firm.io",
  'a@b.co',
  'no-at-sign.com',
  '.leading@dot.com',
  'double..dot@x.com',
  'trailing.@x.com',
  'user@-host.com',
  'user@host',
  'user@host.c',
  'user name@host.com',
  '',
];

const PASSWORDS = ['', 'short1!', 'alllowercase1!', 'ALLUPPER1!', 'NoDigits!!', 'NoSymbol11', 'Str0ng!Pass1', 'Ünïcødé1!a'];

describe('the auth rules the forms check', () => {
  it('accept exactly the addresses z.email() accepts', () => {
    for (const email of EMAILS) {
      expect(EMAIL_PATTERN.test(email), email).toBe(z.email().safeParse(email).success);
      expect(emailIssue(email) === null, email).toBe(signInSchema.shape.email.safeParse(email).success);
    }
  });

  it('name the first rule a password breaks, as the schema does', () => {
    for (const password of PASSWORDS) {
      const parsed = passwordSchema.safeParse(password);
      expect(passwordIssue(password), password).toBe(parsed.success ? null : parsed.error.issues[0]?.message);
    }
  });

  it('score strength from the same rules', () => {
    expect(passwordStrength('short1!')).toBe(0);
    expect(passwordStrength('Str0ng!Pass1')).toBe(4);
    expect(passwordStrength('NoSymbol11')).toBe(3);
  });

  it('report a mismatch on the confirmation field', () => {
    const parsed = resetPasswordSchema.safeParse({ password: 'Str0ng!Pass1', confirmPassword: 'Str0ng!Pass2' });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]).toMatchObject({ message: 'passwordMismatch', path: ['confirmPassword'] });
  });

  it('say every issue in both languages', () => {
    for (const issue of AUTH_ISSUES) {
      expect(en.Auth[issue], `en ${issue}`).toBeTruthy();
      expect(es.Auth[issue], `es ${issue}`).toBeTruthy();
    }
  });
});
