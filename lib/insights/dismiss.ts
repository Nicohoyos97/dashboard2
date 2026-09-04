'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { getCurrentEntity } from '@/lib/auth/getCurrentEntity';
import { createClient } from '@/lib/supabase/server';

// Checking an insight off the Overview. The user and the business are derived
// from the session, never the client; RLS (0008) is the real control and these
// checks only shape the outcome. Nothing is deleted — the insight is derived,
// so all this records is that this person has seen it.

const schema = z.object({
  ruleKey: z.string().trim().min(1).max(64),
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export type DismissInsightInput = z.infer<typeof schema>;

export async function dismissInsight(input: DismissInsightInput): Promise<{ ok: boolean }> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false };

  const entity = await getCurrentEntity();
  // A firm user previewing the portal is not a member: their tick would be a
  // row against a business they do not belong to, which RLS refuses anyway.
  if (!entity || entity.role === 'firm_preview') return { ok: false };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false };

  // ignoreDuplicates → ON CONFLICT DO NOTHING. A plain upsert would take the
  // DO UPDATE branch on a repeat tick (second tab, double click), and 0008
  // deliberately has no UPDATE policy, so RLS rejected the second dismissal of
  // a row that already existed.
  const { error } = await supabase.from('insight_dismissals').upsert(
    {
      user_id: user.id,
      business_entity_id: entity.id,
      rule_key: parsed.data.ruleKey,
      period_start: parsed.data.periodStart,
      period_end: parsed.data.periodEnd,
    },
    { onConflict: 'user_id,business_entity_id,rule_key,period_start,period_end', ignoreDuplicates: true },
  );
  if (error) return { ok: false };

  revalidatePath('/dashboard');
  return { ok: true };
}
