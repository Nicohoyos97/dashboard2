// The firm's PDF report for one published statement (KILL-PDF.md). Authorization
// is the CSV route's, line for line: the active entity comes from the verified
// session, neither the report nor a tenant id is trusted from the browser, and
// RLS remains the backstop.
//
// Rendering runs a headless Chromium, so this handler is deliberately on the
// Node runtime with a longer budget than a data read.
import { z } from 'zod';

import { logAccess } from '@/lib/audit/logAccess';
import { getCurrentEntity } from '@/lib/auth/getCurrentEntity';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { loadPortalEntitySettings, loadPublishedReport, loadReportLines } from '@/lib/portal/load';
import { leafItems } from '@/lib/portal/statement-page';
import { RATE_LIMITS, consumeRateLimit } from '@/lib/rate-limit';
import { ReportRenderError, statementPdf, statementPdfFilename } from '@/lib/reports/pdf';
import { PNL_SYNONYMS } from '@/lib/reports/pnl';
import { reportAssets } from '@/lib/reports/report-assets';
import { buildReportInput } from '@/lib/reports/report-input';
import { findSection } from '@/lib/reports/sections';
import { buildTree } from '@/lib/reports/tree';
import { createClient } from '@/lib/supabase/server';
import { todayIn } from '@/lib/utils/timezone';

export const runtime = 'nodejs';
export const maxDuration = 60;

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

  const [lines, settings] = await Promise.all([
    loadReportLines(supabase, entity.id, report.id),
    loadPortalEntitySettings(supabase, entity.id),
  ]);
  // The nav and the page hide statements the firm did not sell; the export has
  // to agree, or the URL is a way around the sale.
  if (!settings.modules.statements) return new Response(null, { status: 404 });

  const locale = request.headers.get('accept-language')?.toLowerCase().startsWith('es')
    ? 'es'
    : 'en';
  const roots = buildTree(lines);
  const expenses =
    report.reportType === 'profit_and_loss'
      ? leafItems(findSection(roots, PNL_SYNONYMS.operatingExpenses))
      : [];

  let pdf: Uint8Array;
  try {
    pdf = await statementPdf({
      ...buildReportInput({
        report,
        roots,
        entityName: entity.name,
        locale,
        expenses,
        today: todayIn(settings.timezone),
      }),
      assets: await reportAssets(),
    });
  } catch (error) {
    // Fixed code only: never leak a renderer message to the client.
    console.error(
      '[report-pdf] render failed:',
      error instanceof ReportRenderError ? error.message : 'unknown',
    );
    return new Response(null, { status: 503 });
  }

  await logAccess({
    action: 'report.export.pdf',
    resourceType: 'financial_report',
    resourceId: report.id,
    businessEntityId: entity.id,
    metadata: { line_count: lines.length },
  });

  // Copied into its own ArrayBuffer: a Uint8Array over ArrayBufferLike is not
  // a BodyInit under strict lib types, and a statement PDF is small.
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
