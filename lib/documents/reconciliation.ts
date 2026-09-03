// Shape of the `reconciliation` jsonb stored on financial_reports and
// bank_statements by the worker. The vocabulary is the ingestion library's
// (lib/ingestion/reconciliation.ts); this Zod schema is how app code reads the
// column back without trusting it blindly.
import { z } from 'zod';

export { CONFIDENCE_THRESHOLD, RECONCILE_TOLERANCE_CENTS } from '@/lib/ingestion/reconciliation';
export type { Reconciliation, ReconciliationCheck } from '@/lib/ingestion/reconciliation';

import type { Reconciliation } from '@/lib/ingestion/reconciliation';

export const reconciliationSchema = z.object({
  passed: z.boolean(),
  checks: z.array(
    z.object({
      key: z.string(),
      ok: z.boolean(),
      expectedCents: z.number().int(),
      actualCents: z.number().int(),
      toleranceCents: z.number().int(),
      label: z.string(),
    }),
  ),
  lowConfidence: z.object({ count: z.number().int(), refs: z.array(z.string()) }),
});

export function parseReconciliation(value: unknown): Reconciliation | null {
  const parsed = reconciliationSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
