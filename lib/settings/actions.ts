'use server';

import { getTranslations } from 'next-intl/server';
import { z } from 'zod';

import { routing } from '@/i18n/routing';
import { getCurrentEntity } from '@/lib/auth/getCurrentEntity';
import { isOwnAvatarUrl } from '@/lib/settings/avatar';
import { supabaseEnv } from '@/lib/supabase/env';
import { createClient } from '@/lib/supabase/server';

// Profile update — name, (optional) avatar URL and (optional) portal language.
// The avatar file is uploaded client-side to the RLS-scoped Storage bucket;
// this only persists the resulting public URL + the name. Per
// multi-tenant-data-access: RLS-scoped server client, user derived from the
// session, never the client.
const profileSchema = z.object({
  fullName: z.string().trim().min(1).max(80),
  avatarUrl: z.string().url().nullable().optional(),
  locale: z.enum(routing.locales).optional(),
});

export type UpdateProfileResult = { ok: true } | { ok: false; error: string };

export async function updateProfile(input: {
  fullName: string;
  avatarUrl?: string | null;
  locale?: string;
}): Promise<UpdateProfileResult> {
  const t = await getTranslations('Settings');
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: t('saveError') };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: t('saveError') };

  const update: { full_name: string; avatar_url?: string | null; locale?: string } = {
    full_name: parsed.data.fullName,
  };
  if (parsed.data.locale !== undefined) update.locale = parsed.data.locale;
  // Only touch avatar_url when the caller actually changed the photo. The URL
  // comes from the browser after a direct-to-Storage upload, so it is checked
  // against what the uploader should have produced for this user's own folder —
  // an arbitrary host here becomes a tracking pixel on the members page.
  if (parsed.data.avatarUrl !== undefined) {
    if (
      parsed.data.avatarUrl !== null &&
      !isOwnAvatarUrl(parsed.data.avatarUrl, user.id, supabaseEnv().url)
    ) {
      return { ok: false, error: t('saveError') };
    }
    update.avatar_url = parsed.data.avatarUrl;
  }

  // RLS (profiles_self_update) + the id filter both scope this to the caller.
  const { error } = await supabase.from('profiles').update(update).eq('id', user.id);
  if (error) return { ok: false, error: t('saveError') };

  // The language also rides in the auth metadata, which is where the middleware
  // reads it from (i18n/preference.ts) — it verifies the token locally and must
  // not query for a preference on every navigation.
  //
  // updateUser writes the metadata but does NOT re-sign the access token, so
  // without the refresh below the middleware would keep reading the old
  // language until the token happened to expire — up to an hour of a portal
  // that ignores the choice the client just made. refreshSession mints a token
  // from the updated user, and @supabase/ssr writes it to the cookie here.
  if (parsed.data.locale !== undefined) {
    const { error: metadataError } = await supabase.auth.updateUser({
      data: { locale: parsed.data.locale },
    });
    if (metadataError) return { ok: false, error: t('saveError') };
    await supabase.auth.refreshSession();
  }

  return { ok: true };
}

// Business profile update — name + legal name + structured address. The entity
// is derived server-side from the session (getCurrentEntity), never trusted from
// the client. Editing is client_owner-only: we re-check the role here for a clear
// message, and RLS (entities_owner_update) is the final backstop. The jsonb keys
// stay English/canonical (postal_code, etc.); the labels are localized in the UI.
const addressSchema = z.object({
  line1: z.string().trim().max(120),
  line2: z.string().trim().max(120),
  city: z.string().trim().max(80),
  state: z.string().trim().max(80),
  postal_code: z.string().trim().max(20),
  country: z.string().trim().max(80),
});

const entitySchema = z.object({
  name: z.string().trim().min(1).max(120),
  legalName: z.string().trim().max(160),
  address: addressSchema,
});

export type Address = z.infer<typeof addressSchema>;

export type UpdateBusinessEntityResult = { ok: true } | { ok: false; error: string };

export async function updateBusinessEntity(input: {
  name: string;
  legalName: string;
  address: Address;
}): Promise<UpdateBusinessEntityResult> {
  const t = await getTranslations('Settings');
  const parsed = entitySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: t('saveError') };

  // Entity + role come from the session, never the client.
  const entity = await getCurrentEntity();
  if (!entity) return { ok: false, error: t('saveError') };
  if (entity.role !== 'client_owner') return { ok: false, error: t('bizNoPermission') };

  // Drop empty address fields; persist null when the whole address is blank so we
  // don't store an object of empty strings.
  const address = Object.fromEntries(
    Object.entries(parsed.data.address).filter(([, v]) => v.length > 0),
  );
  const legalName = parsed.data.legalName.length > 0 ? parsed.data.legalName : null;

  const supabase = await createClient();
  // RLS (entities_owner_update) is the backstop; the id filter scopes the write.
  const { error } = await supabase
    .from('business_entities')
    .update({
      name: parsed.data.name,
      legal_name: legalName,
      address: Object.keys(address).length > 0 ? address : null,
    })
    .eq('id', entity.id);
  if (error) return { ok: false, error: t('saveError') };

  return { ok: true };
}
