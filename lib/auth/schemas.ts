// Zod schemas validated at the auth trust boundary: the Server Actions run
// them, and they are the authority. The forms check the same rules in the
// browser without zod (./rules), so both are built from one set of values.
// Every message is an AuthIssue key of the `Auth` namespace, which the action
// translates for the reader.
import { z } from 'zod';

import { EMAIL_PATTERN, PASSWORD_MIN, PASSWORD_RULES } from './rules';

export const passwordSchema = PASSWORD_RULES.reduce(
  (schema, rule) => schema.regex(rule.pattern, rule.issue),
  z.string().min(PASSWORD_MIN, 'passwordTooShort'),
);

const emailSchema = z.string().regex(EMAIL_PATTERN, 'emailInvalid');

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'passwordRequired'),
  remember: z.boolean().optional(),
});

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string().min(1, 'confirmRequired'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'passwordMismatch',
    path: ['confirmPassword'],
  });

export type SignInValues = z.infer<typeof signInSchema>;
export type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordValues = z.infer<typeof resetPasswordSchema>;
