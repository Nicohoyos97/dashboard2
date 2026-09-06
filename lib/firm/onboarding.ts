'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { z } from 'zod';

import { logAccess } from '@/lib/audit/logAccess';
import { requireFirmAdmin } from '@/lib/auth/requireFirm';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

import { syncSalesTaxJurisdictions } from './jurisdictions';
import { localePrefix, requestOrigin } from './origin';
import { type ActionResult, invalidEntity } from './result';
import { clientFields, entityConfigFields, localeSchema, memberRoleSchema, refineEntity } from './schemas';

// Setting a client up in one step (§8): the client record, its first business
// with its branding and modules, and — optionally — the invitation that lets
// the owner sign in. Three writes that used to be three screens.
//
// Ordering is deliberate and the failures are reported, not swallowed: the
// client and the business are the durable half, so a failed invitation leaves
// them in place and says so. The firm can resend from the business page rather
// than losing a filled-in form. There is no transaction across PostgREST and
// the auth API, so the alternative would be inventing a rollback that deletes
// records the firm may already be looking at.
const inviteSchema = z.object({
  email: z.union([z.literal(''), z.string().trim().toLowerCase().email().max(160)]),
  fullName: z.string().trim().max(120),
  role: memberRoleSchema,
  locale: localeSchema,
});

const schema = z.object({
  client: z.object(clientFields),
  business: z.object(entityConfigFields).superRefine(refineEntity),
  invite: inviteSchema,
});

export type ClientOnboardingInput = z.infer<typeof schema>;

export type ClientOnboardingResult = {
  clientId: string;
  entityId: string;
  /**
   * Null when everything went through: otherwise the (translated) part of the
   * setup that did not, with the client and the business already created.
   */
  warning: string | null;
  invitedEmail: string | null;
};

export async function createClientWithBusiness(
  input: unknown,
): Promise<ActionResult<ClientOnboardingResult>> {
  const t = await getTranslations('Admin');
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, ...invalidEntity(parsed.error, t) };
  const { client, business, invite } = parsed.data;

  const firm = await requireFirmAdmin();
  const supabase = await createClient();

  const { data: clientRow, error: clientError } = await supabase
    .from('clients')
    .insert({
      firm_id: firm.firmId,
      name: client.name,
      contact_name: client.contactName || null,
      contact_email: client.contactEmail || null,
      notes: client.notes || null,
      created_by: firm.userId,
    })
    .select('id')
    .single();
  if (clientError || !clientRow) return { ok: false, error: t('errorSave') };
  await logAccess({ action: 'client.create', resourceType: 'client', resourceId: clientRow.id });

  const { data: entityRow, error: entityError } = await supabase
    .from('business_entities')
    .insert({
      client_id: clientRow.id,
      name: business.name,
      legal_name: business.legalName || null,
      has_dba: business.hasDba,
      dba_name: business.hasDba ? business.dbaName : null,
      fiscal_year_start_month: business.fiscalYearStartMonth,
      accounting_basis: business.accountingBasis,
      currency: business.currency,
      timezone: business.timezone,
      sales_tax_enabled: business.salesTaxEnabled,
      enabled_modules: business.enabledModules,
      industry: business.industry || null,
      logo_url: business.logoUrl,
      created_by: firm.userId,
    })
    .select('id')
    .single();
  // The client exists at this point. Say which half survived, so the firm goes
  // to the client and adds the business rather than creating a second client.
  if (entityError || !entityRow) {
    revalidatePath('/admin/clients');
    return { ok: false, error: t('onboardingBusinessFailed'), field: 'business' };
  }
  await logAccess({
    action: 'entity.create',
    resourceType: 'business_entity',
    resourceId: entityRow.id,
    businessEntityId: entityRow.id,
  });

  const registered = await syncSalesTaxJurisdictions(
    supabase,
    entityRow.id,
    business.salesTax,
    business.salesTaxEnabled,
  );
  const inviteWarning = invite.email ? await inviteOwner(entityRow.id, invite, t) : null;
  // The jurisdictions are named first: an invitation that went out is not what
  // the firm needs to hear about while a sales-tax client has nowhere on file.
  const warning = registered ? inviteWarning : t('salesTaxSaveFailed');

  revalidatePath('/admin/clients');
  revalidatePath(`/admin/clients/${clientRow.id}`);
  return {
    ok: true,
    value: {
      clientId: clientRow.id,
      entityId: entityRow.id,
      warning,
      invitedEmail: invite.email && !inviteWarning ? invite.email : null,
    },
  };
}

/**
 * Supabase's invite flow: it creates the auth user and emails a one-time link
 * to /invite, where they set a password. `locale` rides in the user metadata so
 * handle_new_user (0019) writes it to the profile — the very first page the
 * client sees is already in their language — and prefixes the return URL for
 * the same reason. Returns null on success, or the message to show.
 */
async function inviteOwner(
  entityId: string,
  invite: z.infer<typeof inviteSchema>,
  t: Awaited<ReturnType<typeof getTranslations<'Admin'>>>,
): Promise<string | null> {
  const redirectTo = `${await requestOrigin()}${localePrefix(invite.locale)}/invite`;
  const { data, error } = await createAdminClient().auth.admin.inviteUserByEmail(invite.email, {
    redirectTo,
    data: { full_name: invite.fullName, locale: invite.locale },
  });
  if (error || !data.user) {
    // An address that already has an account cannot be invited again; the firm
    // links it from the business page instead. Every other failure is most
    // often the mail provider's rate limit, which is worth naming.
    if (error?.code === 'email_exists') return t('onboardingInviteExists');
    return t('onboardingInviteFailed');
  }

  const supabase = await createClient();
  const firm = await requireFirmAdmin();
  const { error: membershipError } = await supabase.from('entity_memberships').insert({
    business_entity_id: entityId,
    user_id: data.user.id,
    role: invite.role,
    invited_by: firm.userId,
  });
  if (membershipError) return t('onboardingMembershipFailed');

  await logAccess({
    action: 'membership.invite',
    resourceType: 'entity_membership',
    resourceId: data.user.id,
    businessEntityId: entityId,
    metadata: { role: invite.role, locale: invite.locale },
  });
  return null;
}
