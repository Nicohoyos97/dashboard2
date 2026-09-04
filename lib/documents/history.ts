// Derived-record history for one document (INITIAL_PROMPT.md §14.19): every
// financial report and bank statement any version of it produced, including
// the ones a later publish superseded. Nothing is ever deleted, so this list —
// together with `audit_logs` — is the firm's record of what the client saw and
// when it stopped being current.
import type { createClient } from '@/lib/supabase/server';

type Db = Awaited<ReturnType<typeof createClient>>;

export type DerivedKind = 'report' | 'bank_statement';

export type DerivedHistoryRow = {
  id: string;
  kind: DerivedKind;
  versionNo: number | null;
  /** Report type key for a statement; institution + masked account for a bank record. */
  label: string;
  reportType: string | null;
  periodStart: string;
  periodEnd: string;
  status: string;
  publishedAt: string | null;
  /**
   * The record that replaced this one. `at` is the replacement's own
   * publication time — the moment the supersession happened — rather than a
   * timestamp we would have to infer from the superseded row.
   */
  replacedBy: { id: string; documentId: string | null; at: string | null } | null;
};

type VersionRef = { id: string; versionNo: number };

/** version_id → document_id, so a replacement can be linked to the document that carries it. */
async function documentsOfVersions(supabase: Db, versionIds: string[]): Promise<Map<string, string>> {
  if (versionIds.length === 0) return new Map();
  const { data } = await supabase.from('document_versions').select('id, document_id').in('id', versionIds);
  return new Map((data ?? []).map((row) => [row.id, row.document_id]));
}

export async function loadDerivedHistory(
  supabase: Db,
  versions: readonly VersionRef[],
): Promise<DerivedHistoryRow[]> {
  const versionIds = versions.map((version) => version.id);
  if (versionIds.length === 0) return [];
  const versionNo = new Map(versions.map((version) => [version.id, version.versionNo]));

  const [{ data: reports }, { data: statements }] = await Promise.all([
    supabase
      .from('financial_reports')
      .select('id, report_type, period_start, period_end, status, published_at, superseded_by, document_version_id')
      .in('document_version_id', versionIds),
    supabase
      .from('bank_statements')
      .select('id, period_start, period_end, status, published_at, superseded_by, document_version_id, bank_accounts ( institution, masked_number )')
      .in('document_version_id', versionIds),
  ]);

  const replacementIds = {
    report: (reports ?? []).flatMap((row) => (row.superseded_by ? [row.superseded_by] : [])),
    bank_statement: (statements ?? []).flatMap((row) => (row.superseded_by ? [row.superseded_by] : [])),
  };
  const [{ data: newerReports }, { data: newerStatements }] = await Promise.all([
    replacementIds.report.length
      ? supabase.from('financial_reports').select('id, published_at, document_version_id').in('id', replacementIds.report)
      : Promise.resolve({ data: [] }),
    replacementIds.bank_statement.length
      ? supabase.from('bank_statements').select('id, published_at, document_version_id').in('id', replacementIds.bank_statement)
      : Promise.resolve({ data: [] }),
  ]);
  const newer = new Map(
    [...(newerReports ?? []), ...(newerStatements ?? [])].map((row) => [row.id, row]),
  );
  const documentOf = await documentsOfVersions(
    supabase,
    [...new Set([...newer.values()].flatMap((row) => (row.document_version_id ? [row.document_version_id] : [])))],
  );

  const replacement = (id: string | null): DerivedHistoryRow['replacedBy'] => {
    if (!id) return null;
    const row = newer.get(id);
    if (!row) return { id, documentId: null, at: null };
    return {
      id,
      documentId: row.document_version_id ? (documentOf.get(row.document_version_id) ?? null) : null,
      at: row.published_at,
    };
  };

  const rows: DerivedHistoryRow[] = [
    ...(reports ?? []).map((row) => ({
      id: row.id,
      kind: 'report' as const,
      versionNo: row.document_version_id ? (versionNo.get(row.document_version_id) ?? null) : null,
      label: row.report_type,
      reportType: row.report_type,
      periodStart: row.period_start,
      periodEnd: row.period_end,
      status: row.status,
      publishedAt: row.published_at,
      replacedBy: replacement(row.superseded_by),
    })),
    ...(statements ?? []).map((row) => ({
      id: row.id,
      kind: 'bank_statement' as const,
      versionNo: row.document_version_id ? (versionNo.get(row.document_version_id) ?? null) : null,
      label: [row.bank_accounts?.institution, row.bank_accounts?.masked_number].filter(Boolean).join(' · '),
      reportType: null,
      periodStart: row.period_start,
      periodEnd: row.period_end,
      status: row.status,
      publishedAt: row.published_at,
      replacedBy: replacement(row.superseded_by),
    })),
  ];

  // Newest period first, then the newest version of that period, so a
  // superseded record sits directly under the one that replaced it.
  return rows.sort((a, b) =>
    a.periodEnd === b.periodEnd ? (b.versionNo ?? 0) - (a.versionNo ?? 0) : b.periodEnd.localeCompare(a.periodEnd),
  );
}
