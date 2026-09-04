// Audited CSV export of the filtered expense rows. The entity comes from the
// verified session and the period must be one the published statements cover —
// neither is trusted from the browser, and RLS remains the backstop.
import { z } from 'zod';

import { logAccess } from '@/lib/audit/logAccess';
import { getCurrentEntity } from '@/lib/auth/getCurrentEntity';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { parseExpenseQuery, sortTransactions } from '@/lib/portal/expense-filters';
import { loadExpenseTransactions } from '@/lib/portal/expenses';
import { loadPortalEntitySettings, loadPublishedBankStatements, loadPublishedReports } from '@/lib/portal/load';
import { parsePeriodParam } from '@/lib/portal/period-param';
import { RATE_LIMITS, consumeRateLimit } from '@/lib/rate-limit';
import { expensesCsv, expensesCsvFilename } from '@/lib/reports/csv';
import { availablePeriods } from '@/lib/reports/periods';
import { createClient } from '@/lib/supabase/server';

const periodSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}$/);

export async function GET(request: Request) {
  const [user, entity] = await Promise.all([getCurrentUser(), getCurrentEntity()]);
  if (!user) return new Response(null, { status: 401 });
  if (!entity) return new Response(null, { status: 404 });
  if (!(await consumeRateLimit(`expense-export:${user.id}`, RATE_LIMITS.download))) {
    return new Response(null, { status: 429 });
  }

  const url = new URL(request.url);
  const parsedPeriod = periodSchema.safeParse(url.searchParams.get('period') ?? '');
  const wanted = parsedPeriod.success ? parsePeriodParam(parsedPeriod.data) : null;
  if (!wanted) return new Response(null, { status: 400 });

  const supabase = await createClient();
  const [settings, reports, statements] = await Promise.all([
    loadPortalEntitySettings(supabase, entity.id),
    loadPublishedReports(supabase, entity.id),
    loadPublishedBankStatements(supabase, entity.id),
  ]);
  const currency = settings.currency;
  // Only a period the portal itself offers: an arbitrary range would let the
  // export reach past what the firm has published.
  const offered = availablePeriods(reports, statements.filter((s) => s.currency === currency))
    .filter((period) => period.sources.includes('bank'))
    .some((period) => period.start === wanted.start && period.end === wanted.end);
  if (!offered) return new Response(null, { status: 404 });

  const { filters, sort } = parseExpenseQuery(Object.fromEntries(url.searchParams.entries()));
  const rows = sortTransactions(await loadExpenseTransactions(supabase, entity.id, currency, wanted, filters), sort);
  // The page passes the locale it rendered in; the browser's language is only
  // a fallback, so the file's headers match the screen it was exported from.
  const requested = url.searchParams.get('locale');
  const locale = requested === 'es' || requested === 'en'
    ? requested
    : request.headers.get('accept-language')?.toLowerCase().startsWith('es') ? 'es' : 'en';
  const csv = expensesCsv(rows, {
    locale,
    ...(locale === 'es' ? { yes: 'Sí', no: 'No' } : { yes: 'Yes', no: 'No' }),
  });

  await logAccess({
    action: 'expenses.export.csv',
    resourceType: 'business_entity',
    resourceId: entity.id,
    businessEntityId: entity.id,
    metadata: { row_count: rows.length, period_start: wanted.start, period_end: wanted.end },
  });

  return new Response(`﻿${csv}`, {
    status: 200,
    headers: {
      'Cache-Control': 'private, no-store',
      'Content-Disposition': `attachment; filename="${expensesCsvFilename(wanted)}"`,
      'Content-Type': 'text/csv; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
