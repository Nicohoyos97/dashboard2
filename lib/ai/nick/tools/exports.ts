// The two sensitive tools (spec §10 "Never … perform a sensitive action
// without an explicit confirmation turn"). A first call records a pending
// action and returns requires_confirmation; the real link is produced only
// when the router saw the user confirm that exact item in a later message.
import { randomUUID } from 'node:crypto';

import { NICK_LIMITS } from '@/lib/ai/nick/config';
import type { PendingAction } from '@/lib/ai/nick/types';
import { logAccess } from '@/lib/audit/logAccess';
import { loadPublishedReport, loadReportLines } from '@/lib/portal/load';
import { statementCsv, statementCsvFilename } from '@/lib/reports/csv';
import { buildTree } from '@/lib/reports/tree';

import { type ToolContext, type ToolResult, periodOf, reportOut } from './context';
import type { ToolInput } from './schemas';

function isConfirmed(ctx: ToolContext, action: PendingAction, confirmed: boolean): boolean {
  const pending = ctx.confirmedAction;
  return confirmed && pending !== null && pending.tool === action.tool && pending.resourceId === action.resourceId;
}

function askConfirmation(ctx: ToolContext, action: PendingAction, details: ToolResult): ToolResult {
  ctx.setPendingAction(action);
  return {
    requires_confirmation: true,
    action: action.tool,
    describe: action.label,
    ...details,
    instruction: 'Describe this to the user and ask them to confirm. Do not call again with confirmed: true until the user explicitly confirms in a later message.',
  };
}

export async function getReportDownloadLink(ctx: ToolContext, input: ToolInput<'get_report_download_link'>): Promise<ToolResult> {
  // Two lookups rather than an embed: documents and document_versions
  // reference each other (document_id / current_version_id), which makes a
  // PostgREST embed ambiguous. RLS still gates both reads.
  const { data } = await ctx.supabase
    .from('document_versions')
    .select('id, original_filename, document_id')
    .eq('id', input.document_version_id)
    .eq('business_entity_id', ctx.entityId)
    .eq('upload_status', 'uploaded')
    .maybeSingle();
  const { data: doc } = data
    ? await ctx.supabase
        .from('documents')
        .select('title, status, current_version_id, period_start, period_end, document_type')
        .eq('id', data.document_id)
        .eq('business_entity_id', ctx.entityId)
        .maybeSingle()
    : { data: null };
  if (!data || !doc || doc.status !== 'published' || doc.current_version_id !== data.id) {
    return { available: false, reason: 'document_not_published' };
  }
  const period = doc.period_start && doc.period_end ? periodOf({ periodStart: doc.period_start, periodEnd: doc.period_end }, ctx.locale) : null;
  const action: PendingAction = {
    tool: 'get_report_download_link',
    resourceId: data.id,
    label: `${doc.title}${period ? ` (${period.label})` : ''} — ${data.original_filename}`,
  };
  if (!isConfirmed(ctx, action, input.confirmed)) {
    return askConfirmation(ctx, action, { document: { title: doc.title, type: doc.document_type, period, filename: data.original_filename } });
  }
  await logAccess({ action: 'chat.download_link.issued', resourceType: 'document_version', resourceId: data.id, businessEntityId: ctx.entityId, metadata: { session_id: ctx.sessionId } });
  return {
    available: true,
    document: { title: doc.title, period, filename: data.original_filename },
    url: `/api/documents/${data.id}/download`,
    note: 'The link authorizes the download when clicked and serves the exact original file; each click is audited and the signed URL behind it expires in 60 seconds.',
  };
}

export async function createFinancialExport(ctx: ToolContext, input: ToolInput<'create_financial_export'>): Promise<ToolResult> {
  const report = await loadPublishedReport(ctx.supabase, ctx.entityId, input.report_id);
  if (!report) return { available: false, reason: 'report_not_published' };
  const filename = statementCsvFilename(report);
  const action: PendingAction = { tool: 'create_financial_export', resourceId: report.id, label: `CSV export — ${filename}` };
  if (!isConfirmed(ctx, action, input.confirmed)) {
    return askConfirmation(ctx, action, { report: reportOut(ctx, report), format: input.format, filename });
  }

  const lines = await loadReportLines(ctx.supabase, ctx.entityId, report.id);
  const csv = `﻿${statementCsv(buildTree(lines), { locale: ctx.locale })}`;
  const exportId = randomUUID();
  const path = `${ctx.entityId}/${exportId}/${filename}`;
  const expiresAt = new Date(Date.now() + NICK_LIMITS.exportTtlHours * 3_600_000).toISOString();
  const admin = ctx.admin();
  const upload = await admin.storage.from('exports').upload(path, csv, { contentType: 'text/csv; charset=utf-8', upsert: false });
  if (upload.error) return { available: false, reason: 'export_failed' };
  const { error } = await admin.from('generated_exports').insert({
    id: exportId,
    business_entity_id: ctx.entityId,
    user_id: ctx.userId,
    kind: 'csv',
    report_id: report.id,
    storage_path: path,
    status: 'ready',
    expires_at: expiresAt,
  });
  if (error) return { available: false, reason: 'export_failed' };

  await logAccess({ action: 'chat.export.created', resourceType: 'generated_export', resourceId: exportId, businessEntityId: ctx.entityId, metadata: { report_id: report.id, line_count: lines.length, kind: 'csv' } });
  return {
    available: true,
    report: reportOut(ctx, report),
    filename,
    url: `/api/exports/${exportId}/download`,
    expiresAt,
    note: 'The link authorizes the download when clicked; the file is available for 24 hours.',
  };
}
