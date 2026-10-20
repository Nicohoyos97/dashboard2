// The firm's PDF report (KILL-PDF.md) for a Profit & Loss over any range of
// dates, added up from the published statements (lib/reports/range.ts).
// Authorization and audit are the range CSV route's; rendering is the
// statement PDF route's, on the Node runtime with its longer budget.
import { logAccess } from '@/lib/audit/logAccess';
import { getCurrentEntity } from '@/lib/auth/getCurrentEntity';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { loadPortalEntitySettings } from '@/lib/portal/load';
import { parsePeriodParam, periodParam } from '@/lib/portal/period-param';
import { loadRangeFigures } from '@/lib/portal/report-period';
import { RATE_LIMITS, consumeRateLimit } from '@/lib/rate-limit';
import { ReportRenderError, statementPdf, statementPdfFilename } from '@/lib/reports/pdf';
import { reportAssets } from '@/lib/reports/report-assets';
import { buildReportInput } from '@/lib/reports/report-input';
import { createClient } from '@/lib/supabase/server';
import { todayIn } from '@/lib/utils/timezone';

export const runtime = 'nodejs';
export const maxDuration = 60;

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
  const report = { ...figures.report, basis: figures.report.basis ?? settings.accountingBasis };
  let pdf: Uint8Array;
  try {
    pdf = await statementPdf({
      ...buildReportInput({ report, roots: figures.roots, entityName: entity.name, locale, today: todayIn(settings.timezone) }),
      assets: await reportAssets(),
    });
  } catch (error) {
    // Fixed code only: never leak a renderer message to the client.
    console.error('[report-pdf] render failed:', error instanceof ReportRenderError ? error.message : error instanceof Error ? error.name : 'unknown');
    return new Response(null, { status: 503 });
  }

  await logAccess({
    action: 'report.export.pdf',
    resourceType: 'business_entity',
    resourceId: entity.id,
    businessEntityId: entity.id,
    metadata: { period: periodParam(period), line_count: figures.statement.rows.length },
  });

  return new Response(new Uint8Array(pdf).buffer, {
    status: 200,
    headers: {
      'Cache-Control': 'private, no-store',
      'Content-Disposition': `attachment; filename="${statementPdfFilename(report)}"`,
      'Content-Type': 'application/pdf',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
