// The field schemas the firm's provisioning actions share. They live outside
// the 'use server' modules because such a file may only export async
// functions — and because the client dialog now creates a client, its first
// business and its first user in one submit, so all three shapes have to be
// composable rather than each locked inside the action that first needed it.
import { z } from 'zod';

import { routing } from '@/i18n/routing';
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

export const entityConfigFields = {
  name: z.string().trim().min(1).max(120),
  legalName: z.string().trim().max(160),
  fiscalYearStartMonth: z.number().int().min(1).max(12),
  accountingBasis: z.enum(['cash', 'accrual']),
  currency: z.string().trim().length(3).toUpperCase(),
  // The calendar the business keeps: every "today" in the portal resolves in
  // it, so a name this runtime cannot format is refused here as well as by the
  // trigger in 0010.
  timezone: z.string().trim().min(1).max(64).refine(isValidTimeZone, 'invalid_timezone'),
  salesTaxEnabled: z.boolean(),
  enabledModules: modulesSchema,
  industry: z.string().trim().max(80),
  // Written by the firm's uploader into the `logos` bucket, so it is checked
  // against that bucket rather than accepted as any URL — the same reasoning as
  // profile avatars, and this one is rendered for every member of the business.
  logoUrl: z.string().trim().url().nullable(),
};

/** The portal language the firm sets for a client they invite (0019). */
export const localeSchema = z.enum(routing.locales);

export const memberRoleSchema = z.enum(['client_owner', 'client_viewer']);

export type EnabledModules = z.infer<typeof modulesSchema>;
export type MemberRole = z.infer<typeof memberRoleSchema>;
