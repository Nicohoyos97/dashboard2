// Audited CSV of the transactions behind one P&L account line (0026).
// Authorization is the statement CSV route's: the business comes from the
// verified session, the module must have been sold, and RLS is the backstop —
// it returns a line only from a published P&L and transactions only from the
// accounts the firm's publication matched to it.
import { z } from 'zod';

import { logAccess } from '@/lib/audit/logAccess';
import { getCurrentEntity } from '@/lib/auth/getCurrentEntity';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { ledgerCsv, ledgerCsvFilename } from '@/lib/ledger/csv';
import { loadLineLedger } from '@/lib/ledger/load';
import { loadPortalEntitySettings } from '@/lib/portal/load';
import { RATE_LIMITS, consumeRateLimit } from '@/lib/rate-limit';
import { createClient } from '@/lib/supabase/server';

const paramsSchema = z.object({ lineId: z.string().uuid() });

export async function GET(request: Request, context: { params: Promise<{ lineId: string }> }) {
  const parsed = paramsSchema.safeParse(await context.params);
  if (!parsed.success) return new Response(null, { status: 404 });

  const [user, entity] = await Promise.all([getCurrentUser(), getCurrentEntity()]);
  if (!user) return new Response(null, { status: 401 });
  if (!entity) return new Response(null, { status: 404 });
  if (!(await consumeRateLimit(`report-export:${user.id}`, RATE_LIMITS.download))) {
    return new Response(null, { status: 429 });
  }

  const supabase = await createClient();
  const settings = await loadPortalEntitySettings(supabase, entity.id);
  if (!settings.modules.bookkeeping) return new Response(null, { status: 404 });
  const found = await loadLineLedger(supabase, entity.id, parsed.data.lineId);
  // No ledger behind the line is "nothing to export", not an empty file that looks like one.
  if (!found?.detail) return new Response(null, { status: 404 });

  const locale = request.headers.get('accept-language')?.toLowerCase().startsWith('es') ? 'es' : 'en';
  const csv = ledgerCsv(found.line.accountName, found.txns, locale);

  await logAccess({
    action: 'ledger.export.csv',
    resourceType: 'financial_report',
    resourceId: found.report.id,
    businessEntityId: entity.id,
    metadata: { transaction_count: found.txns.length },
  });

  return new Response(`﻿${csv}`, {
    status: 200,
    headers: {
      'Cache-Control': 'private, no-store',
      'Content-Disposition': `attachment; filename="${ledgerCsvFilename(found.line.accountName, found.report)}"`,
      'Content-Type': 'text/csv; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
