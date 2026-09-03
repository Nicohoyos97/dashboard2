'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { z } from 'zod';

import { logAccess } from '@/lib/audit/logAccess';
import { requireFirmAdmin } from '@/lib/auth/requireFirm';
import { createClient } from '@/lib/supabase/server';

import type { ActionResult } from './result';

// Firm client management (INITIAL_PROMPT.md §8). Every action: Zod at the
// boundary → requireFirmAdmin() (role + aal2) → RLS-scoped client (the
// clients_admin_* policies are the enforcement) → audit row.
const clientFields = {
  name: z.string().trim().min(1).max(120),
  contactName: z.string().trim().max(120),
  contactEmail: z.union([z.literal(''), z.string().trim().email().max(160)]),
  notes: z.string().trim().max(4000),
};

const createSchema = z.object(clientFields);
const updateSchema = z.object({ id: z.string().uuid(), ...clientFields });
const statusSchema = z.object({ id: z.string().uuid(), status: z.enum(['active', 'archived']) });

export type ClientInput = z.infer<typeof createSchema>;

export async function createFirmClient(input: unknown): Promise<ActionResult<{ id: string }>> {
  const t = await getTranslations('Admin');
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: t('errorInvalid') };

  const firm = await requireFirmAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('clients')
    .insert({
      firm_id: firm.firmId,
      name: parsed.data.name,
      contact_name: parsed.data.contactName || null,
      contact_email: parsed.data.contactEmail || null,
      notes: parsed.data.notes || null,
      created_by: firm.userId,
    })
    .select('id')
    .single();
  if (error || !data) return { ok: false, error: t('errorSave') };

  await logAccess({ action: 'client.create', resourceType: 'client', resourceId: data.id });
  revalidatePath('/admin/clients');
  return { ok: true, value: { id: data.id } };
}

export async function updateFirmClient(input: unknown): Promise<ActionResult> {
  const t = await getTranslations('Admin');
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: t('errorInvalid') };

  await requireFirmAdmin();
  const supabase = await createClient();
  const { error, data } = await supabase
    .from('clients')
    .update({
      name: parsed.data.name,
      contact_name: parsed.data.contactName || null,
      contact_email: parsed.data.contactEmail || null,
      notes: parsed.data.notes || null,
    })
    .eq('id', parsed.data.id)
    .select('id');
  if (error || !data?.length) return { ok: false, error: t('errorSave') };

  await logAccess({ action: 'client.update', resourceType: 'client', resourceId: parsed.data.id });
  revalidatePath('/admin/clients');
  revalidatePath(`/admin/clients/${parsed.data.id}`);
  return { ok: true, value: undefined };
}

// Clients are archived, never deleted (history stays; RLS has no DELETE).
export async function setFirmClientStatus(input: unknown): Promise<ActionResult> {
  const t = await getTranslations('Admin');
  const parsed = statusSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: t('errorInvalid') };

  await requireFirmAdmin();
  const supabase = await createClient();
  const { error, data } = await supabase
    .from('clients')
    .update({ status: parsed.data.status })
    .eq('id', parsed.data.id)
    .select('id');
  if (error || !data?.length) return { ok: false, error: t('errorSave') };

  await logAccess({
    action: parsed.data.status === 'archived' ? 'client.archive' : 'client.restore',
    resourceType: 'client',
    resourceId: parsed.data.id,
  });
  revalidatePath('/admin/clients');
  revalidatePath(`/admin/clients/${parsed.data.id}`);
  return { ok: true, value: undefined };
}
