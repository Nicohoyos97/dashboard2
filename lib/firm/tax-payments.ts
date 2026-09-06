'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { z } from 'zod';

import { logAccess } from '@/lib/audit/logAccess';
import { requireFirmAdmin } from '@/lib/auth/requireFirm';
import { sumCents, toCents } from '@/lib/money';
import { createClient } from '@/lib/supabase/server';

import type { ActionResult } from './result';

// Marking a tax obligation paid from the firm portal.
//
// The pipeline can already do this from an uploaded payment confirmation, but
// most payments are an ACH transfer whose "confirmation" is a number in an
// email — there is no document to upload, and the client was left looking at a
// balance the firm had already settled.
//
// What it writes: a tax_payments row (the record of the payment) and
// `status = 'paid'` on the obligation. It deliberately does NOT clear
// `amount_payable` — the portal reads `status === 'paid'` first (remainingFor
// in lib/reports/taxes.ts) and shows nothing owed, while the figure stays as
// the record of what was owed. And it does not touch `document_version_id`:
// the obligation belongs to the filing, and a payment is not a filing.
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const schema = z.object({
  obligationId: z.string().uuid(),
  paidOn: isoDate,
  amount: z.string().trim().min(1).max(32),
  confirmationNumber: z.string().trim().max(80),
  method: z.string().trim().max(40),
});

export async function recordTaxPayment(input: unknown): Promise<ActionResult> {
  const t = await getTranslations('Admin');
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: t('errorInvalid') };

  let amountCents: number;
  try {
    amountCents = toCents(parsed.data.amount);
  } catch {
    return { ok: false, error: t('correctionNotANumber') };
  }
  if (amountCents < 0) return { ok: false, error: t('correctionNotANumber') };

  const firm = await requireFirmAdmin();
  const supabase = await createClient();

  const { data: obligation } = await supabase
    .from('tax_obligations')
    .select('id, business_entity_id, published_at')
    .eq('id', parsed.data.obligationId)
    .maybeSingle();
  if (!obligation) return { ok: false, error: t('errorInvalid') };

  // The client sees a payment only once it is published (0005). An obligation
  // they can already see, marked paid, must come with the payment behind it —
  // otherwise the status says settled and nothing explains it.
  const published = obligation.published_at;

  // One firm-entered payment per obligation, edited rather than stacked: a
  // corrected amount should replace the wrong one, and tax_payments has no
  // DELETE policy to undo an extra row with.
  const { data: existing } = await supabase
    .from('tax_payments')
    .select('id')
    .eq('obligation_id', obligation.id)
    .eq('source', 'firm_entry')
    .maybeSingle();

  const row = {
    business_entity_id: obligation.business_entity_id,
    obligation_id: obligation.id,
    paid_on: parsed.data.paidOn,
    amount: amountCents / 100,
    method: parsed.data.method || null,
    confirmation_number: parsed.data.confirmationNumber || null,
    source: 'firm_entry',
    published_at: published,
    published_by: published ? firm.userId : null,
  };
  const written = existing
    ? await supabase.from('tax_payments').update(row).eq('id', existing.id)
    : await supabase.from('tax_payments').insert({ ...row, created_by: firm.userId });
  if (written.error) return { ok: false, error: t('errorSave') };

  // amount_paid is every payment against this obligation, not just this one:
  // a document-extracted payment and a firm entry can both exist.
  const { data: payments } = await supabase
    .from('tax_payments')
    .select('amount')
    .eq('obligation_id', obligation.id);
  const paidCents = sumCents((payments ?? []).map((p) => toCents(p.amount)));

  const { error } = await supabase
    .from('tax_obligations')
    .update({ status: 'paid', amount_paid: paidCents / 100 })
    .eq('id', obligation.id);
  if (error) return { ok: false, error: t('errorSave') };

  await logAccess({
    action: 'tax_obligation.mark_paid',
    resourceType: 'tax_obligation',
    resourceId: obligation.id,
    businessEntityId: obligation.business_entity_id,
    metadata: { paid_on: parsed.data.paidOn },
  });
  revalidatePath(`/admin/entities/${obligation.business_entity_id}`);
  return { ok: true, value: undefined };
}
