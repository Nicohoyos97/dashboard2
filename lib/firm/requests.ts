'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { z } from 'zod';

import { logAccess } from '@/lib/audit/logAccess';
import { requireFirmAdmin } from '@/lib/auth/requireFirm';
import { createClient } from '@/lib/supabase/server';

import type { ActionResult } from './result';

// The firm's side of the account-request queue (INITIAL_PROMPT.md §7). A client
// asks for a data export or an account deletion; the firm answers here. The
// portal still has no destructive path: "completed" records that the firm did
// the work under its own retention rules, it does not delete anything.
//
// Zod at the boundary → requireFirmAdmin() (role + aal2) → RLS-scoped client
// (the 0007 policy is the enforcement, and the 0013 guard pins the transition)
// → audit row carrying identifiers and the new status only, never the client's
// message or the firm's note.
const schema = z.object({
  id: z.string().uuid(),
  status: z.enum(['in_progress', 'completed', 'declined']),
  firmNote: z.string().trim().max(2000).optional(),
});

export async function answerAccountRequest(input: unknown): Promise<ActionResult> {
  const t = await getTranslations('Admin');
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: t('errorInvalid') };

  await requireFirmAdmin();
  const supabase = await createClient();

  // Only an open request can be answered; the guard would raise on a resolved
  // one, and matching here turns that into the queue's own message.
  const { data, error } = await supabase
    .from('account_requests')
    .update({
      status: parsed.data.status,
      ...(parsed.data.firmNote === undefined ? {} : { firm_note: parsed.data.firmNote || null }),
    })
    .eq('id', parsed.data.id)
    .in('status', ['pending', 'in_progress'])
    .select('id, business_entity_id, kind')
    .maybeSingle();
  if (error) return { ok: false, error: t('errorSave') };
  if (!data) return { ok: false, error: t('requestClosed') };

  await logAccess({
    action: `account_request.${parsed.data.status}`,
    resourceType: 'account_request',
    resourceId: data.id,
    businessEntityId: data.business_entity_id,
    metadata: { kind: data.kind },
  });
  revalidatePath('/admin/requests');
  revalidatePath('/admin');
  return { ok: true, value: undefined };
}
