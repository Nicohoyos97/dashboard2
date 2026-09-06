// Result shape shared by the firm Server Actions. `error` is already
// translated (the action resolves the message server-side, like lib/auth).
import type { getTranslations } from 'next-intl/server';
import type { z } from 'zod';

import { isDbaIssue, salesTaxIssue } from './schemas';

export type ActionResult<T = undefined> =
  | { ok: true; value: T }
  | { ok: false; error: string; field?: string };

type Translate = Awaited<ReturnType<typeof getTranslations<'Admin'>>>;

/**
 * Why a business form did not validate, in the words the firm needs.
 *
 * The cross-field rules are the ones worth naming: "invalid" is useless when
 * the only thing missing is the state a sales-tax client collects in. Shared by
 * all three actions that write a business so they cannot report it differently.
 */
export function invalidEntity(error: z.ZodError, t: Translate): { error: string; field?: string } {
  if (isDbaIssue(error)) return { error: t('dbaRequired'), field: 'dbaName' };
  const salesTax = salesTaxIssue(error);
  if (salesTax === 'state') return { error: t('salesTaxStateRequired'), field: 'salesTax.state' };
  if (salesTax === 'city') return { error: t('salesTaxCityRequired'), field: 'salesTax.cities' };
  return { error: t('errorInvalid') };
}
