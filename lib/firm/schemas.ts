// The field schemas the firm's provisioning actions share. They live outside
// the 'use server' modules because such a file may only export async
// functions — and because the client dialog now creates a client, its first
// business and its first user in one submit, so all three shapes have to be
// composable rather than each locked inside the action that first needed it.
import { z } from 'zod';

import { routing } from '@/i18n/routing';
import { isUsStateCode } from '@/lib/taxes/us-jurisdictions';
import { isValidTimeZone } from '@/lib/utils/timezone';

export const clientFields = {
  name: z.string().trim().min(1).max(120),
  contactName: z.string().trim().max(120),
  contactEmail: z.union([z.literal(''), z.string().trim().email().max(160)]),
  notes: z.string().trim().max(4000),
};

// One key per thing the firm sells: `bookkeeping` covers the statements and the
// expense breakdown together (0019 collapsed the two switches that only ever
// produced a combination nobody sells). Sales tax keeps its own column.
export const modulesSchema = z.object({
  bookkeeping: z.boolean(),
  income_taxes: z.boolean(),
});

// Where the business collects sales tax, asked at the moment the module is
// turned on. The state is a code from a closed list; the cities are free text
// because the taxing body on a registration is whatever it says it is ("City of
// Niles", "Village of Skokie"). Both become tax_jurisdictions rows (0024), and
// the client's portal prints their names.
export const salesTaxSchema = z.object({
  state: z.union([
    z.literal(''),
    z.string().trim().toUpperCase().refine(isUsStateCode, 'invalid_state'),
  ]),
  hasCityTax: z.boolean(),
  cities: z.array(z.string().trim().max(120)).max(20),
});

export type SalesTaxRegistration = z.infer<typeof salesTaxSchema>;

export const entityConfigFields = {
  name: z.string().trim().min(1).max(120),
  legalName: z.string().trim().max(160),
  // Whether the business trades under a DBA, and which one. Recorded rather
  // than inferred from an empty field: "no DBA" and "not asked yet" are
  // different answers, and the pair is checked below so a `no` cannot carry a
  // leftover name — the same constraint the database enforces in 0021.
  hasDba: z.boolean(),
  dbaName: z.string().trim().max(160),
  fiscalYearStartMonth: z.number().int().min(1).max(12),
  accountingBasis: z.enum(['cash', 'accrual']),
  currency: z.string().trim().length(3).toUpperCase(),
  // The calendar the business keeps: every "today" in the portal resolves in
  // it, so a name this runtime cannot format is refused here as well as by the
  // trigger in 0010.
  timezone: z.string().trim().min(1).max(64).refine(isValidTimeZone, 'invalid_timezone'),
  salesTaxEnabled: z.boolean(),
  salesTax: salesTaxSchema,
  enabledModules: modulesSchema,
  industry: z.string().trim().max(80),
  // Written by the firm's uploader into the `logos` bucket, so it is checked
  // against that bucket rather than accepted as any URL — the same reasoning as
  // profile avatars, and this one is rendered for every member of the business.
  logoUrl: z.string().trim().url().nullable(),
};

/**
 * A DBA answer that agrees with itself. Applied by every schema built from
 * `entityConfigFields`, so the form, the one-step onboarding and the edit
 * dialog cannot drift on it.
 */
export function refineDba<T extends { hasDba: boolean; dbaName: string }>(
  values: T,
  ctx: z.RefinementCtx,
): void {
  if (values.hasDba && values.dbaName.trim() === '') {
    ctx.addIssue({ code: 'custom', path: ['dbaName'], message: 'dba_required' });
  }
}

/** Whether a failed parse failed *because* of the DBA pair, so the form can say so. */
export function isDbaIssue(error: z.ZodError): boolean {
  return error.issues.some((issue) => issue.message === 'dba_required');
}

/**
 * Selling sales tax means knowing where. The module and its registration are
 * checked together for the same reason the DBA pair is: a business whose portal
 * has a Sales Taxes page and no jurisdiction on file is a half-filled record
 * that looks complete.
 *
 * Cities left over from a "yes" that became a "no" are not an error here — the
 * form clears them and syncSalesTaxJurisdictions never reads them — so the only
 * thing that can be missing is an answer the firm has not given.
 */
export function refineSalesTax<
  T extends { salesTaxEnabled: boolean; salesTax: SalesTaxRegistration },
>(values: T, ctx: z.RefinementCtx): void {
  if (!values.salesTaxEnabled) return;
  if (values.salesTax.state === '') {
    ctx.addIssue({ code: 'custom', path: ['salesTax', 'state'], message: 'sales_tax_state_required' });
  }
  if (values.salesTax.hasCityTax && values.salesTax.cities.every((city) => city.trim() === '')) {
    ctx.addIssue({ code: 'custom', path: ['salesTax', 'cities'], message: 'sales_tax_city_required' });
  }
}

/** Which half of the sales-tax registration is missing, so the form can say which. */
export function salesTaxIssue(error: z.ZodError): 'state' | 'city' | null {
  if (error.issues.some((issue) => issue.message === 'sales_tax_state_required')) return 'state';
  if (error.issues.some((issue) => issue.message === 'sales_tax_city_required')) return 'city';
  return null;
}

/**
 * Every cross-field rule a business carries, in one place: the three actions
 * that write one (create, edit, one-step onboarding) apply this rather than
 * each remembering the list.
 */
export function refineEntity<
  T extends {
    hasDba: boolean;
    dbaName: string;
    salesTaxEnabled: boolean;
    salesTax: SalesTaxRegistration;
  },
>(values: T, ctx: z.RefinementCtx): void {
  refineDba(values, ctx);
  refineSalesTax(values, ctx);
}

/** The portal language the firm sets for a client they invite (0019). */
export const localeSchema = z.enum(routing.locales);

export const memberRoleSchema = z.enum(['client_owner', 'client_viewer']);

export type EnabledModules = z.infer<typeof modulesSchema>;
export type MemberRole = z.infer<typeof memberRoleSchema>;
