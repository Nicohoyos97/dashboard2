// The transactions behind one P&L account line, as JSON, for the Expenses
// table to open an account when the client asks for it instead of shipping
// every account's transactions with the page. Authorization is the CSV
// route's beside it: the business comes from the verified session, the module
// must have been sold, and RLS is the backstop — it returns a line only from a
// published P&L and transactions only from the accounts the firm's
// publication matched to it.
import { z } from 'zod';

import { logAccess } from '@/lib/audit/logAccess';
import { getCurrentEntity } from '@/lib/auth/getCurrentEntity';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { loadLineLedger } from '@/lib/ledger/load';
import { loadPortalEntitySettings } from '@/lib/portal/load';
import { createClient } from '@/lib/supabase/server';

const paramsSchema = z.object({ lineId: z.string().uuid() });

export async function GET(_request: Request, context: { params: Promise<{ lineId: string }> }) {
  const parsed = paramsSchema.safeParse(await context.params);
  if (!parsed.success) return new Response(null, { status: 404 });

  const [user, entity] = await Promise.all([getCurrentUser(), getCurrentEntity()]);
  if (!user) return new Response(null, { status: 401 });
  if (!entity) return new Response(null, { status: 404 });

  const supabase = await createClient();
  const [settings, found] = await Promise.all([
    loadPortalEntitySettings(supabase, entity.id),
    loadLineLedger(supabase, entity.id, parsed.data.lineId),
  ]);
  if (!settings.modules.bookkeeping || !found?.detail) return new Response(null, { status: 404 });

  // The same entry the line's own page writes: opening an account is reading it.
  await logAccess(
    {
      action: 'ledger.view',
      resourceType: 'financial_report',
      resourceId: found.report.id,
      businessEntityId: entity.id,
      metadata: { transaction_count: found.txns.length },
    },
    { afterResponse: true },
  );

  return Response.json({ txns: found.txns }, { headers: { 'Cache-Control': 'private, no-store' } });
}
