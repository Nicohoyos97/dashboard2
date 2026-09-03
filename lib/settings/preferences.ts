'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { z } from 'zod';

import { logAccess } from '@/lib/audit/logAccess';
import { getCurrentEntity } from '@/lib/auth/getCurrentEntity';
import { createClient } from '@/lib/supabase/server';

import {
  ACCOUNT_REQUEST_KINDS,
  type AccountRequestKind,
  type NotificationPreferences,
  type SaveResult,
} from './types';

// Settings mutations for Phase 5 (§7): notification preferences and the two
// account requests. Both derive the user and the business entity server-side —
// never from the client — and both run on the RLS-scoped client, so the
// policies in 0007 are the real control and these checks only shape the message.

const preferencesSchema = z.object({
  reminders: z.boolean(),
  new_reports: z.boolean(),
  tax_deadlines: z.boolean(),
  document_activity: z.boolean(),
  email_digest: z.boolean(),
});

export async function updateNotificationPreferences(input: NotificationPreferences): Promise<SaveResult> {
  const t = await getTranslations('Settings');
  const parsed = preferencesSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: t('saveError') };

  const entity = await getCurrentEntity();
  if (!entity || entity.role === 'firm_preview') return { ok: false, error: t('saveError') };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: t('saveError') };

  const { error } = await supabase
    .from('notification_preferences')
    .upsert(
      { user_id: user.id, business_entity_id: entity.id, ...parsed.data, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,business_entity_id' },
    );
  if (error) return { ok: false, error: t('saveError') };

  revalidatePath('/settings/notifications');
  return { ok: true };
}

const requestSchema = z.object({
  kind: z.enum(ACCOUNT_REQUEST_KINDS),
  message: z.string().trim().max(1000).optional(),
});

/**
 * Queue a data-export or account-deletion request for the firm (§7). Deletion
 * is a request, never an action: the portal has no path that removes financial
 * records, and the partial unique index in 0007 stops duplicates.
 */
export async function requestAccountAction(input: { kind: AccountRequestKind; message?: string }): Promise<SaveResult> {
  const t = await getTranslations('Settings');
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: t('saveError') };

  const entity = await getCurrentEntity();
  if (!entity || entity.role === 'firm_preview') return { ok: false, error: t('saveError') };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: t('saveError') };

  const { error } = await supabase.from('account_requests').insert({
    business_entity_id: entity.id,
    user_id: user.id,
    kind: parsed.data.kind,
    status: 'pending',
    message: parsed.data.message?.trim() || null,
  });
  // The unique index rejects a second open request of the same kind; say so
  // rather than reporting a generic failure.
  if (error) return { ok: false, error: error.code === '23505' ? t('requestDuplicate') : t('saveError') };

  await logAccess({
    action: `account_request.${parsed.data.kind}`,
    resourceType: 'business_entity',
    resourceId: entity.id,
    businessEntityId: entity.id,
  });

  revalidatePath('/settings/privacy');
  return { ok: true };
}

const cancelSchema = z.object({ id: z.string().uuid() });

/** Withdraw a request the caller raised. RLS allows only pending → cancelled on their own row. */
export async function cancelAccountRequest(input: { id: string }): Promise<SaveResult> {
  const t = await getTranslations('Settings');
  const parsed = cancelSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: t('saveError') };

  const supabase = await createClient();
  const { error } = await supabase
    .from('account_requests')
    .update({ status: 'cancelled' })
    .eq('id', parsed.data.id)
    .eq('status', 'pending');
  if (error) return { ok: false, error: t('saveError') };

  revalidatePath('/settings/privacy');
  return { ok: true };
}
