'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { z } from 'zod';

import { logAccess } from '@/lib/audit/logAccess';
import { requireFirmAdmin } from '@/lib/auth/requireFirm';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

import { localePrefix, requestOrigin } from './origin';
import type { ActionResult } from './result';
import { localeSchema } from './schemas';

// Linking people to a business (INITIAL_PROMPT.md §8 "invite users"; bootstrap
// note 3). Two paths:
//   linkUserByEmail — the person already has an account (self-signup, Google):
//     look the profile up (profiles_firm_select) and add the membership.
//   inviteUser — no account yet: Supabase's invite flow creates the auth user
//     and emails a link to /invite where they set a password. The auth admin
//     API needs the service role; that is an identity operation, not tenant
//     data, and the membership itself is written through RLS as the firm admin.
const roleSchema = z.enum(['client_owner', 'client_viewer']);
const linkSchema = z.object({
  entityId: z.string().uuid(),
  email: z.string().trim().toLowerCase().email().max(160),
  role: roleSchema,
});
// `locale` is the *invitee's* language, not the admin's: the email link and the
// portal behind it open in the language the client reads (0019).
const inviteSchema = linkSchema.extend({
  fullName: z.string().trim().max(120),
  locale: localeSchema,
});
const memberSchema = z.object({ entityId: z.string().uuid(), userId: z.string().uuid() });
const roleChangeSchema = memberSchema.extend({ role: roleSchema });

async function addMembership(entityId: string, userId: string, role: 'client_owner' | 'client_viewer') {
  const firm = await requireFirmAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from('entity_memberships')
    .insert({ business_entity_id: entityId, user_id: userId, role, invited_by: firm.userId });
  return error;
}

export async function linkUserByEmail(input: unknown): Promise<ActionResult> {
  const t = await getTranslations('Admin');
  const parsed = linkSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: t('errorInvalid') };

  await requireFirmAdmin();
  const supabase = await createClient();
  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('email', parsed.data.email)
    .maybeSingle();
  if (!profile) return { ok: false, error: t('memberNotFound'), field: 'email' };

  const error = await addMembership(parsed.data.entityId, profile.id, parsed.data.role);
  if (error) {
    return { ok: false, error: error.code === '23505' ? t('memberExists') : t('errorSave') };
  }

  await logAccess({
    action: 'membership.link',
    resourceType: 'entity_membership',
    resourceId: profile.id,
    businessEntityId: parsed.data.entityId,
    metadata: { role: parsed.data.role },
  });
  revalidatePath(`/admin/entities/${parsed.data.entityId}`);
  return { ok: true, value: undefined };
}

export async function inviteUser(input: unknown): Promise<ActionResult> {
  const t = await getTranslations('Admin');
  const parsed = inviteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: t('errorInvalid') };

  await requireFirmAdmin();
  const redirectTo = `${await requestOrigin()}${localePrefix(parsed.data.locale)}/invite`;

  const { data, error: inviteError } = await createAdminClient().auth.admin.inviteUserByEmail(
    parsed.data.email,
    { redirectTo, data: { full_name: parsed.data.fullName, locale: parsed.data.locale } },
  );
  if (inviteError || !data.user) {
    // An existing account cannot be invited again — link it instead.
    if (inviteError?.code === 'email_exists') {
      return { ok: false, error: t('memberAlreadyHasAccount'), field: 'email' };
    }
    return { ok: false, error: t('errorSave') };
  }

  const error = await addMembership(parsed.data.entityId, data.user.id, parsed.data.role);
  if (error) return { ok: false, error: t('errorSave') };

  await logAccess({
    action: 'membership.invite',
    resourceType: 'entity_membership',
    resourceId: data.user.id,
    businessEntityId: parsed.data.entityId,
    metadata: { role: parsed.data.role, locale: parsed.data.locale },
  });
  revalidatePath(`/admin/entities/${parsed.data.entityId}`);
  return { ok: true, value: undefined };
}

export async function updateMemberRole(input: unknown): Promise<ActionResult> {
  const t = await getTranslations('Admin');
  const parsed = roleChangeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: t('errorInvalid') };

  await requireFirmAdmin();
  const supabase = await createClient();
  const { error, data } = await supabase
    .from('entity_memberships')
    .update({ role: parsed.data.role })
    .eq('business_entity_id', parsed.data.entityId)
    .eq('user_id', parsed.data.userId)
    .select('user_id');
  if (error || !data?.length) return { ok: false, error: t('errorSave') };

  await logAccess({
    action: 'membership.role',
    resourceType: 'entity_membership',
    resourceId: parsed.data.userId,
    businessEntityId: parsed.data.entityId,
    metadata: { role: parsed.data.role },
  });
  revalidatePath(`/admin/entities/${parsed.data.entityId}`);
  return { ok: true, value: undefined };
}

export async function removeMember(input: unknown): Promise<ActionResult> {
  const t = await getTranslations('Admin');
  const parsed = memberSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: t('errorInvalid') };

  await requireFirmAdmin();
  const supabase = await createClient();
  const { error, data } = await supabase
    .from('entity_memberships')
    .delete()
    .eq('business_entity_id', parsed.data.entityId)
    .eq('user_id', parsed.data.userId)
    .select('user_id');
  if (error || !data?.length) return { ok: false, error: t('errorSave') };

  await logAccess({
    action: 'membership.remove',
    resourceType: 'entity_membership',
    resourceId: parsed.data.userId,
    businessEntityId: parsed.data.entityId,
  });
  revalidatePath(`/admin/entities/${parsed.data.entityId}`);
  return { ok: true, value: undefined };
}
