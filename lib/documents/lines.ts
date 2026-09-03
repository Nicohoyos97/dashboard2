'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { z } from 'zod';

import { logAccess } from '@/lib/audit/logAccess';
import { requireFirmAdmin } from '@/lib/auth/requireFirm';
import type { ActionResult } from '@/lib/firm/result';
import { toCents } from '@/lib/money';
import { createClient } from '@/lib/supabase/server';

import { recomputeReport } from './recompute';

// Firm corrections to extracted statement lines (INITIAL_PROMPT.md §8
// "correct low-confidence fields"). The model's values stay in extracted_*;
// current / prior become the effective figures and the row is stamped as
// corrected. The parent report's reconciliation is recomputed right away,
// and the document status follows (reconciled or needs_review).
const amount = z.union([z.literal(''), z.string().trim().max(32)]);
const schema = z.object({ lineId: z.string().uuid(), current: amount, prior: amount });

// numeric(18,2) accepts a JS number with two decimals exactly; cents keep the
// parsing deterministic.
function parseAmount(value: string): number | null {
  if (value === '') return null;
  return toCents(value) / 100;
}

export async function correctLine(input: unknown): Promise<ActionResult> {
  const t = await getTranslations('Admin');
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: t('errorInvalid') };

  let current: number | null;
  let prior: number | null;
  try {
    current = parseAmount(parsed.data.current);
    prior = parseAmount(parsed.data.prior);
  } catch {
    return { ok: false, error: t('errorInvalid') };
  }

  const firm = await requireFirmAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('financial_statement_lines')
    .update({ current, prior, corrected_by: firm.userId, corrected_at: new Date().toISOString() })
    .eq('id', parsed.data.lineId)
    .select('id, report_id, business_entity_id');
  const line = data?.[0];
  if (error || !line) return { ok: false, error: t('errorSave') };

  await recomputeReport(supabase, line.report_id);

  await logAccess({
    action: 'statement_line.correct',
    resourceType: 'financial_statement_line',
    resourceId: line.id,
    businessEntityId: line.business_entity_id,
  });
  revalidatePath('/admin/documents');
  return { ok: true, value: undefined };
}
