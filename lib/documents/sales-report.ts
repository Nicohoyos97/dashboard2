'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { z } from 'zod';

import { logAccess } from '@/lib/audit/logAccess';
import { requireFirmAdmin } from '@/lib/auth/requireFirm';
import type { ActionResult } from '@/lib/firm/result';
import { fromCents, toCents } from '@/lib/money';
import { reconcileSalesReport } from '@/lib/ingestion/reconcile';
import { createClient } from '@/lib/supabase/server';
import type { Json } from '@/lib/supabase/types';

// Firm corrections to an extracted point-of-sale report (§8 "correct
// low-confidence fields"), the same contract as correctLine for statements:
// the firm edits the effective figures, the reconciliation is recomputed from
// the stored rows right away, and the document status follows.
//
// A published report is not editable — it is withdrawn first, like everything
// else the client can see.
const amount = z.union([z.literal(''), z.string().trim().max(32)]);
const schema = z.object({
  reportId: z.string().uuid(),
  grossSales: amount,
  netSales: amount,
  refunds: amount,
  discounts: amount,
  tips: amount,
  taxCollected: amount,
  taxExpected: amount,
  amountCollected: amount,
});

/** '' means "not printed on the report" and is stored as null, never as zero. */
function parseAmount(value: string): number | null {
  if (value === '') return null;
  return toCents(value) / 100;
}

const FIELDS = [
  ['grossSales', 'gross_sales'],
  ['netSales', 'net_sales'],
  ['refunds', 'refunds'],
  ['discounts', 'discounts'],
  ['tips', 'tips'],
  ['taxCollected', 'tax_collected'],
  ['taxExpected', 'tax_expected'],
  ['amountCollected', 'amount_collected'],
] as const;

export async function correctSalesReport(input: unknown): Promise<ActionResult> {
  const t = await getTranslations('Admin');
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: t('errorInvalid') };

  let values: Partial<Record<(typeof FIELDS)[number][1], number | null>>;
  try {
    values = Object.fromEntries(
      FIELDS.map(([key, column]) => [column, parseAmount(parsed.data[key])]),
    ) as typeof values;
  } catch {
    // toCents refuses anything that is not a plain decimal, which is what
    // keeps a typo out of a figure the client will read.
    return { ok: false, error: t('correctionNotANumber') };
  }

  await requireFirmAdmin();
  const supabase = await createClient();

  const { data: updated, error } = await supabase
    .from('sales_reports')
    .update(values)
    .eq('id', parsed.data.reportId)
    .neq('status', 'published')
    .select('id, business_entity_id, source_system, period_start, period_end, confidence, gross_sales, net_sales, refunds, discounts, tips, tax_collected, tax_expected, amount_collected, sales_report_tenders ( amount )');
  const report = updated?.[0];
  if (error || !report) return { ok: false, error: t('correctionBlockedPublished') };

  // Recomputed from what is now stored, not from what the model first said —
  // the firm has looked at these figures, so they are the ones that count.
  const decimal = (value: string | number | null) =>
    value === null ? null : fromCents(toCents(value as string | number));
  const reconciliation = reconcileSalesReport(
    {
      confidence: report.confidence ?? 1,
      gross_sales: decimal(report.gross_sales),
      // tax figures are not part of any identity here; the shape only carries
      // what reconcileSalesReport reads.
      net_sales: decimal(report.net_sales),
      refunds: decimal(report.refunds),
      discounts: decimal(report.discounts),
      amount_collected: decimal(report.amount_collected),
    },
    report.sales_report_tenders.map((tender) => ({ amount: fromCents(toCents(tender.amount)) })),
  );

  await supabase
    .from('sales_reports')
    .update({
      reconciliation: reconciliation as unknown as Json,
      status: reconciliation.passed ? 'reconciled' : 'needs_review',
    })
    .eq('id', report.id);

  await logAccess({
    action: 'sales_report.correct',
    resourceType: 'sales_report',
    resourceId: report.id,
    businessEntityId: report.business_entity_id,
    metadata: { reconciled: reconciliation.passed },
  });
  revalidatePath('/admin/documents');
  return { ok: true, value: undefined };
}
