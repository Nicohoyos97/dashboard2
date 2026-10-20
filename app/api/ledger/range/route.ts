// The transactions behind one account line of a range — "August 15 to
// September 15" — as JSON for the Expenses table, or as a CSV. A range's line
// adds up several statements' accounts (lib/reports/range.ts), so this route
// re-reads the range from the URL rather than trusting anything the browser
// says about it: the business comes from the verified session, the module must
// have been sold, and RLS returns only published statements and the accounts
// the firm's publication matched to them.
import { z } from 'zod';

import { logAccess } from '@/lib/audit/logAccess';
import { getCurrentEntity } from '@/lib/auth/getCurrentEntity';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { ledgerCsv, ledgerCsvFilename } from '@/lib/ledger/csv';
import { sumCents } from '@/lib/money';
import { loadPortalEntitySettings } from '@/lib/portal/load';
import { parsePeriodParam, periodParam } from '@/lib/portal/period-param';
import { loadRange, loadRangeLineTransactions } from '@/lib/portal/range-statement';
import { RATE_LIMITS, consumeRateLimit } from '@/lib/rate-limit';
import { createClient } from '@/lib/supabase/server';

const querySchema = z.object({
  period: z.string(),
  line: z.string().regex(/^r[0-9a-z]{1,12}$/),
  format: z.enum(['json', 'csv']).default('json'),
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
  const period = parsed.success ? parsePeriodParam(parsed.data.period) : null;
  if (!parsed.success || !period) return new Response(null, { status: 404 });
  const { line: lineId, format } = parsed.data;

  const [user, entity] = await Promise.all([getCurrentUser(), getCurrentEntity()]);
  if (!user) return new Response(null, { status: 401 });
  if (!entity) return new Response(null, { status: 404 });
  if (format === 'csv' && !(await consumeRateLimit(`report-export:${user.id}`, RATE_LIMITS.download))) {
    return new Response(null, { status: 429 });
  }

  const supabase = await createClient();
  const settings = await loadPortalEntitySettings(supabase, entity.id);
  if (!settings.modules.bookkeeping) return new Response(null, { status: 404 });
  const outcome = await loadRange(supabase, entity.id, settings.currency, period);
  const line = outcome.ok ? outcome.statement.ledger.get(lineId) : undefined;
  const row = outcome.ok ? outcome.statement.rows.find((r) => r.id === lineId) : undefined;
  if (!outcome.ok || !line || !row) return new Response(null, { status: 404 });

  const txns = await loadRangeLineTransactions(supabase, entity.id, line);
  // The page tells the client these add up to the figure beside them; a list
  // that does not is not handed out.
  if (sumCents(txns.map((tx) => tx.amountCents)) !== row.currentCents) {
    console.error('[ledger-range] transactions do not add up to the line');
    return new Response(null, { status: 404 });
  }

  const audit = {
    resourceType: 'business_entity',
    resourceId: entity.id,
    businessEntityId: entity.id,
    metadata: { period: periodParam(period), transaction_count: txns.length },
  };
  if (format === 'json') {
    await logAccess({ action: 'ledger.view', ...audit }, { afterResponse: true });
    return Response.json({ txns }, { headers: { 'Cache-Control': 'private, no-store' } });
  }

  const locale = request.headers.get('accept-language')?.toLowerCase().startsWith('es') ? 'es' : 'en';
  await logAccess({ action: 'ledger.export.csv', ...audit });
  return new Response(`﻿${ledgerCsv(row.accountName, txns, locale)}`, {
    status: 200,
    headers: {
      'Cache-Control': 'private, no-store',
      'Content-Disposition': `attachment; filename="${ledgerCsvFilename(row.accountName, outcome.statement.report)}"`,
      'Content-Type': 'text/csv; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
