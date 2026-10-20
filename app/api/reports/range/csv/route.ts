// Audited CSV of a Profit & Loss for any range of dates, added up from the
// published statements (lib/reports/range.ts) — the export beside the P&L page
// when the dates are not one published statement. Authorization is the
// statement CSV route's: the business from the verified session, the module
// gate, RLS as the backstop.
import { logAccess } from '@/lib/audit/logAccess';
import { getCurrentEntity } from '@/lib/auth/getCurrentEntity';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { loadPortalEntitySettings } from '@/lib/portal/load';
import { parsePeriodParam, periodParam } from '@/lib/portal/period-param';
import { loadRangeFigures } from '@/lib/portal/report-period';
import { RATE_LIMITS, consumeRateLimit } from '@/lib/rate-limit';
import { statementCsv, statementCsvFilename } from '@/lib/reports/csv';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const period = parsePeriodParam(new URL(request.url).searchParams.get('period') ?? undefined);
  if (!period) return new Response(null, { status: 404 });

  const [user, entity] = await Promise.all([getCurrentUser(), getCurrentEntity()]);
  if (!user) return new Response(null, { status: 401 });
  if (!entity) return new Response(null, { status: 404 });
  if (!(await consumeRateLimit(`report-export:${user.id}`, RATE_LIMITS.download))) {
    return new Response(null, { status: 429 });
  }

  const supabase = await createClient();
  const settings = await loadPortalEntitySettings(supabase, entity.id);
  if (!settings.modules.bookkeeping) return new Response(null, { status: 404 });
  const figures = await loadRangeFigures(supabase, entity.id, settings.currency, period);
  if (!figures) return new Response(null, { status: 404 });

  const locale = request.headers.get('accept-language')?.toLowerCase().startsWith('es') ? 'es' : 'en';
  const csv = statementCsv(figures.roots, { locale });

  await logAccess({
    action: 'report.export.csv',
    resourceType: 'business_entity',
    resourceId: entity.id,
    businessEntityId: entity.id,
    metadata: { period: periodParam(period), line_count: figures.statement.rows.length },
  });

  return new Response(`﻿${csv}`, {
    status: 200,
    headers: {
      'Cache-Control': 'private, no-store',
      'Content-Disposition': `attachment; filename="${statementCsvFilename(figures.report)}"`,
      'Content-Type': 'text/csv; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
