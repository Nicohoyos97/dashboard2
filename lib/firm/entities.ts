'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { z } from 'zod';

import { logAccess } from '@/lib/audit/logAccess';
import { requireFirmAdmin } from '@/lib/auth/requireFirm';
import { createClient } from '@/lib/supabase/server';

import type { ActionResult } from './result';

// Business (entity) provisioning and configuration by the firm
// (INITIAL_PROMPT.md §5, §8). The firm-controlled columns edited here are the
// ones guard_entity_firm_columns keeps clients away from.
const modulesSchema = z.object({
  expenses: z.boolean(),
  income_taxes: z.boolean(),
});

const configFields = {
  name: z.string().trim().min(1).max(120),
  legalName: z.string().trim().max(160),
  fiscalYearStartMonth: z.number().int().min(1).max(12),
  accountingBasis: z.enum(['cash', 'accrual']),
  currency: z.string().trim().length(3).toUpperCase(),
  salesTaxEnabled: z.boolean(),
  enabledModules: modulesSchema,
};

const createSchema = z.object({ clientId: z.string().uuid(), ...configFields });
const updateSchema = z.object({ id: z.string().uuid(), ...configFields });
const statusSchema = z.object({ id: z.string().uuid(), status: z.enum(['active', 'archived']) });
const notesSchema = z.object({ entityId: z.string().uuid(), notes: z.string().trim().max(8000) });

export type EntityConfigInput = z.infer<typeof createSchema>;
export type EnabledModules = z.infer<typeof modulesSchema>;

export async function createEntity(input: unknown): Promise<ActionResult<{ id: string }>> {
  const t = await getTranslations('Admin');
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: t('errorInvalid') };

  const firm = await requireFirmAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('business_entities')
    .insert({
      client_id: parsed.data.clientId,
      name: parsed.data.name,
      legal_name: parsed.data.legalName || null,
      fiscal_year_start_month: parsed.data.fiscalYearStartMonth,
      accounting_basis: parsed.data.accountingBasis,
      currency: parsed.data.currency,
      sales_tax_enabled: parsed.data.salesTaxEnabled,
      enabled_modules: parsed.data.enabledModules,
      created_by: firm.userId,
    })
    .select('id')
    .single();
  if (error || !data) return { ok: false, error: t('errorSave') };

  await logAccess({
    action: 'entity.create',
    resourceType: 'business_entity',
    resourceId: data.id,
    businessEntityId: data.id,
  });
  revalidatePath(`/admin/clients/${parsed.data.clientId}`);
  return { ok: true, value: { id: data.id } };
}

export async function updateEntityConfig(input: unknown): Promise<ActionResult> {
  const t = await getTranslations('Admin');
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: t('errorInvalid') };

  await requireFirmAdmin();
  const supabase = await createClient();
  const { error, data } = await supabase
    .from('business_entities')
    .update({
      name: parsed.data.name,
      legal_name: parsed.data.legalName || null,
      fiscal_year_start_month: parsed.data.fiscalYearStartMonth,
      accounting_basis: parsed.data.accountingBasis,
      currency: parsed.data.currency,
      sales_tax_enabled: parsed.data.salesTaxEnabled,
      enabled_modules: parsed.data.enabledModules,
    })
    .eq('id', parsed.data.id)
    .select('id, client_id');
  const row = data?.[0];
  if (error || !row) return { ok: false, error: t('errorSave') };

  await logAccess({
    action: 'entity.update_config',
    resourceType: 'business_entity',
    resourceId: row.id,
    businessEntityId: row.id,
  });
  revalidatePath(`/admin/entities/${row.id}`);
  revalidatePath(`/admin/clients/${row.client_id}`);
  return { ok: true, value: undefined };
}

export async function setEntityStatus(input: unknown): Promise<ActionResult> {
  const t = await getTranslations('Admin');
  const parsed = statusSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: t('errorInvalid') };

  await requireFirmAdmin();
  const supabase = await createClient();
  const { error, data } = await supabase
    .from('business_entities')
    .update({ status: parsed.data.status })
    .eq('id', parsed.data.id)
    .select('id, client_id');
  const row = data?.[0];
  if (error || !row) return { ok: false, error: t('errorSave') };

  await logAccess({
    action: parsed.data.status === 'archived' ? 'entity.archive' : 'entity.restore',
    resourceType: 'business_entity',
    resourceId: row.id,
    businessEntityId: row.id,
  });
  revalidatePath(`/admin/entities/${row.id}`);
  revalidatePath(`/admin/clients/${row.client_id}`);
  return { ok: true, value: undefined };
}

// Firm-internal notes live in their own firm-only table (never on the entity
// row, which clients can read).
export async function saveEntityNotes(input: unknown): Promise<ActionResult> {
  const t = await getTranslations('Admin');
  const parsed = notesSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: t('errorInvalid') };

  const firm = await requireFirmAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from('entity_firm_notes').upsert({
    business_entity_id: parsed.data.entityId,
    notes: parsed.data.notes,
    updated_by: firm.userId,
  });
  if (error) return { ok: false, error: t('errorSave') };

  revalidatePath(`/admin/entities/${parsed.data.entityId}`);
  return { ok: true, value: undefined };
}
