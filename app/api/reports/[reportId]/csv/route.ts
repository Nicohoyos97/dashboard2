// Audited CSV export for one published financial statement. The active entity
// comes from the verified session; neither the report nor a tenant id is trusted
// from the browser. RLS remains the authorization backstop.
import { z } from 'zod';

import { logAccess } from '@/lib/audit/logAccess';
import { getCurrentEntity } from '@/lib/auth/getCurrentEntity';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { loadPortalEntitySettings, loadPublishedReport, loadReportLines } from '@/lib/portal/load';
import { RATE_LIMITS, consumeRateLimit } from '@/lib/rate-limit';
import { statementCsv, statementCsvFilename } from '@/lib/reports/csv';
import { buildTree } from '@/lib/reports/tree';
import { createClient } from '@/lib/supabase/server';

const paramsSchema = z.object({ reportId: z.string().uuid() });

export async function GET(request: Request, context: { params: Promise<{ reportId: string }> }) {
  const parsed = paramsSchema.safeParse(await context.params);
  if (!parsed.success) return new Response(null, { status: 404 });

  const [user, entity] = await Promise.all([getCurrentUser(), getCurrentEntity()]);
  if (!user) return new Response(null, { status: 401 });
  if (!entity) return new Response(null, { status: 404 });
  if (!(await consumeRateLimit(`report-export:${user.id}`, RATE_LIMITS.download))) {
    return new Response(null, { status: 429 });
  }

  const supabase = await createClient();
  const report = await loadPublishedReport(supabase, entity.id, parsed.data.reportId);
  if (!report) return new Response(null, { status: 404 });
  // The nav and the page hide statements the firm did not sell; the export has
  // to agree, or the URL is a way around the sale. The PDF route has always
  // checked this; this one did not, which left the same statement one query
  // string away for a client who never bought bookkeeping.
  const [lines, settings] = await Promise.all([
    loadReportLines(supabase, entity.id, report.id),
    loadPortalEntitySettings(supabase, entity.id),
  ]);
  if (!settings.modules.bookkeeping) return new Response(null, { status: 404 });
  const locale = request.headers.get('accept-language')?.toLowerCase().startsWith('es') ? 'es' : 'en';
  const csv = statementCsv(buildTree(lines), { locale });

  await logAccess({
    action: 'report.export.csv',
    resourceType: 'financial_report',
    resourceId: report.id,
    businessEntityId: entity.id,
    metadata: { line_count: lines.length },
  });

  return new Response(`\uFEFF${csv}`, {
    status: 200,
    headers: {
      'Cache-Control': 'private, no-store',
      'Content-Disposition': `attachment; filename="${statementCsvFilename(report)}"`,
      'Content-Type': 'text/csv; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
