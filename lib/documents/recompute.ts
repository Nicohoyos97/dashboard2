// Re-run the deterministic statement reconciliation from the rows in the
// database (after a firm correction). Corrected lines count as confident: the
// firm has looked at them. Runs on whichever Supabase client the caller holds
// — the firm admin's RLS-scoped session or the worker's service role.
import 'server-only';

import { fromCents } from '@/lib/money';
import type { HierarchyRow } from '@/lib/ingestion/hierarchy';
import { reconcileStatement } from '@/lib/ingestion/reconcile';
import type { Reconciliation } from '@/lib/ingestion/reconciliation';
import type { StatementType } from '@/lib/ingestion/schemas/financial-statement';
import type { createClient } from '@/lib/supabase/server';
import type { Json } from '@/lib/supabase/types';

import { parseReconciliation } from './reconciliation';

type Db = Awaited<ReturnType<typeof createClient>>;

const cents = (value: number | null): number | null => (value === null ? null : Math.round(value * 100));

export async function recomputeReport(supabase: Db, reportId: string): Promise<Reconciliation | null> {
  const { data: report } = await supabase
    .from('financial_reports')
    .select('id, report_type, document_version_id, status')
    .eq('id', reportId)
    .maybeSingle();
  if (!report || report.status === 'published') return null;

  const { data: lines } = await supabase
    .from('financial_statement_lines')
    .select('id, parent_line_id, depth, section, account_name, account_number, current, prior, is_section, is_total, page_number, source_text, confidence, corrected_at')
    .eq('report_id', reportId)
    .order('position');
  if (!lines || lines.length === 0) return null;

  const indexById = new Map(lines.map((l, i) => [l.id, i]));
  const rows: HierarchyRow[] = lines.map((l, i) => {
    const parentIndex = l.parent_line_id ? (indexById.get(l.parent_line_id) ?? null) : null;
    const currentCents = cents(l.current);
    const priorCents = cents(l.prior);
    return {
      ref: `L${i + 1}`,
      parent_ref: parentIndex === null ? null : `L${parentIndex + 1}`,
      depth: l.depth,
      section: l.section ?? '',
      account_name: l.account_name,
      ...(l.account_number ? { account_number: l.account_number } : {}),
      current: currentCents === null ? null : fromCents(currentCents),
      prior: priorCents === null ? null : fromCents(priorCents),
      is_section: l.is_section,
      is_total: l.is_total,
      page: l.page_number ?? 1,
      source_text: l.source_text ?? '',
      confidence: l.corrected_at ? 1 : (l.confidence ?? 1),
      position: i,
      parentIndex,
      currentCents,
      priorCents,
    };
  });

  const reportType: StatementType = report.report_type === 'balance_sheet' ? 'balance_sheet' : 'profit_and_loss';
  const reconciliation = reconcileStatement(rows, reportType);
  await supabase
    .from('financial_reports')
    .update({
      reconciliation: JSON.parse(JSON.stringify(reconciliation)) as Json,
      status: reconciliation.passed ? 'reconciled' : 'needs_review',
    })
    .eq('id', reportId);

  if (report.document_version_id) await syncDocumentStatus(supabase, report.document_version_id);
  return reconciliation;
}

// The document is reconciled when every record derived from the version the
// firm is reviewing passes; otherwise it stays in review. This is the status
// the Publish button reads, so it answers the same question publishBlockers
// asks, from the same column — a document whose figures all reconcile but
// whose row says `needs_review` is a button that never comes back.
//
// "Every record" means every kind publishBlockers reads. Counting only reports
// and statements is what stranded a corrected point-of-sale report: its own row
// reconciled, the document stayed in review, and publishing became impossible.
//
// The document is found through the version rather than by matching
// `current_version_id`, which is the *publication* pointer and deliberately
// does not move while a document is published (see reviewVersion in
// publish.ts) — matching on it meant a correction to v2 synced nothing at all.
// Only the newest uploaded version speaks for the document, so a correction to
// an older one is read and then dropped.
export async function syncDocumentStatus(supabase: Db, versionId: string): Promise<void> {
  const { data: version } = await supabase
    .from('document_versions')
    .select('document_id')
    .eq('id', versionId)
    .maybeSingle();
  if (!version) return;

  const { data: review } = await supabase
    .from('document_versions')
    .select('id')
    .eq('document_id', version.document_id)
    .eq('upload_status', 'uploaded')
    .order('version_no', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!review || review.id !== versionId) return;

  const { data: doc } = await supabase
    .from('documents')
    .select('id, status')
    .eq('id', version.document_id)
    .maybeSingle();
  if (!doc || doc.status === 'published') return;

  const [reports, statements, sales, taxes, payroll] = await Promise.all([
    supabase
      .from('financial_reports')
      .select('reconciliation')
      .eq('document_version_id', versionId),
    supabase.from('bank_statements').select('reconciliation').eq('document_version_id', versionId),
    supabase.from('sales_reports').select('reconciliation').eq('document_version_id', versionId),
    supabase.from('tax_obligations').select('reconciliation').eq('document_version_id', versionId),
    supabase
      .from('payroll_obligations')
      .select('reconciliation')
      .eq('document_version_id', versionId),
  ]);
  const derived = [
    ...(reports.data ?? []),
    ...(statements.data ?? []),
    ...(sales.data ?? []),
    ...(taxes.data ?? []),
    ...(payroll.data ?? []),
  ];
  const passed = (row: { reconciliation: unknown }) =>
    parseReconciliation(row.reconciliation)?.passed === true;
  const status = derived.length > 0 && derived.every(passed) ? 'reconciled' : 'needs_review';
  await supabase.from('documents').update({ status }).eq('id', doc.id);
}
