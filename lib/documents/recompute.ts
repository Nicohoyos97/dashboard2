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

// The document is reconciled when every derived record of its current
// version passes; otherwise it stays in review.
export async function syncDocumentStatus(supabase: Db, versionId: string): Promise<void> {
  const [{ data: reports }, { data: statements }, { data: doc }] = await Promise.all([
    supabase.from('financial_reports').select('status').eq('document_version_id', versionId),
    supabase.from('bank_statements').select('status').eq('document_version_id', versionId),
    supabase.from('documents').select('id, status').eq('current_version_id', versionId).maybeSingle(),
  ]);
  if (!doc || doc.status === 'published') return;
  const all = [...(reports ?? []), ...(statements ?? [])];
  const status = all.length > 0 && all.every((r) => r.status === 'reconciled') ? 'reconciled' : 'needs_review';
  await supabase.from('documents').update({ status }).eq('id', doc.id);
}
