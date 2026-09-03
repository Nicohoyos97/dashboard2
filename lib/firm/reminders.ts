'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { z } from 'zod';

import { logAccess } from '@/lib/audit/logAccess';
import { requireFirmAdmin } from '@/lib/auth/requireFirm';
import { toCents } from '@/lib/money';
import { createClient } from '@/lib/supabase/server';

import { REMINDER_STORED_STATUSES, REMINDER_TYPES } from './reminder-types';
import type { ActionResult } from './result';

// Firm-entered reminders and obligations (INITIAL_PROMPT.md §7 Reminders,
// §8 "add reminders"). Clients see a reminder only once it is published;
// the firm can keep drafts. Amounts are optional (a date can matter alone).
const fields = {
  reminderType: z.enum(REMINDER_TYPES),
  title: z.string().trim().min(1).max(160),
  amount: z.union([z.literal(''), z.string().trim().max(32)]),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  responsible: z.enum(['firm', 'client']),
  actionRequired: z.string().trim().max(500),
  status: z.enum(REMINDER_STORED_STATUSES),
  published: z.boolean(),
};
const createSchema = z.object({ entityId: z.string().uuid(), ...fields });
const updateSchema = z.object({ id: z.string().uuid(), ...fields });
const idSchema = z.object({ id: z.string().uuid() });

export type ReminderInput = z.infer<typeof createSchema>;

function amountOf(value: string): number | null {
  return value === '' ? null : toCents(value) / 100;
}

export async function createReminder(input: unknown): Promise<ActionResult<{ id: string }>> {
  const t = await getTranslations('Admin');
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: t('errorInvalid') };
  let amount: number | null;
  try {
    amount = amountOf(parsed.data.amount);
  } catch {
    return { ok: false, error: t('errorInvalid') };
  }
  const firm = await requireFirmAdmin();
  const supabase = await createClient();
  const d = parsed.data;
  const { data, error } = await supabase
    .from('reminders')
    .insert({
      business_entity_id: d.entityId,
      reminder_type: d.reminderType,
      title: d.title,
      amount,
      due_date: d.dueDate,
      status: d.status,
      responsible: d.responsible,
      action_required: d.actionRequired || null,
      source: 'firm_entry',
      published_at: d.published ? new Date().toISOString() : null,
      published_by: d.published ? firm.userId : null,
      created_by: firm.userId,
    })
    .select('id')
    .single();
  if (error || !data) return { ok: false, error: t('errorSave') };

  await logAccess({ action: 'reminder.create', resourceType: 'reminder', resourceId: data.id, businessEntityId: d.entityId });
  revalidatePath(`/admin/entities/${d.entityId}`);
  return { ok: true, value: { id: data.id } };
}

export async function updateReminder(input: unknown): Promise<ActionResult> {
  const t = await getTranslations('Admin');
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: t('errorInvalid') };
  let amount: number | null;
  try {
    amount = amountOf(parsed.data.amount);
  } catch {
    return { ok: false, error: t('errorInvalid') };
  }
  const firm = await requireFirmAdmin();
  const supabase = await createClient();
  const d = parsed.data;
  const { data: existing } = await supabase.from('reminders').select('published_at').eq('id', d.id).maybeSingle();
  if (!existing) return { ok: false, error: t('errorInvalid') };
  const publishedAt = d.published ? (existing.published_at ?? new Date().toISOString()) : null;
  const { data, error } = await supabase
    .from('reminders')
    .update({
      reminder_type: d.reminderType,
      title: d.title,
      amount,
      due_date: d.dueDate,
      status: d.status,
      responsible: d.responsible,
      action_required: d.actionRequired || null,
      published_at: publishedAt,
      published_by: publishedAt ? firm.userId : null,
      completed_at: d.status === 'completed' || d.status === 'paid' ? new Date().toISOString() : null,
    })
    .eq('id', d.id)
    .select('id, business_entity_id');
  const row = data?.[0];
  if (error || !row) return { ok: false, error: t('errorSave') };

  await logAccess({ action: 'reminder.update', resourceType: 'reminder', resourceId: row.id, businessEntityId: row.business_entity_id });
  revalidatePath(`/admin/entities/${row.business_entity_id}`);
  return { ok: true, value: undefined };
}

export async function deleteReminder(input: unknown): Promise<ActionResult> {
  const t = await getTranslations('Admin');
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: t('errorInvalid') };
  await requireFirmAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase.from('reminders').delete().eq('id', parsed.data.id).select('id, business_entity_id');
  const row = data?.[0];
  if (error || !row) return { ok: false, error: t('errorSave') };

  await logAccess({ action: 'reminder.delete', resourceType: 'reminder', resourceId: row.id, businessEntityId: row.business_entity_id });
  revalidatePath(`/admin/entities/${row.business_entity_id}`);
  return { ok: true, value: undefined };
}
