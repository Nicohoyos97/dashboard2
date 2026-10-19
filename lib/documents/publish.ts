'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { z } from 'zod';

import { logAccess } from '@/lib/audit/logAccess';
import { requireFirmAdmin } from '@/lib/auth/requireFirm';
import type { ActionResult } from '@/lib/firm/result';
import { type LedgerBlocker, reviewLedger } from '@/lib/ledger/review';
import { notifyEntityMembers } from '@/lib/notifications/notify';
import { createClient } from '@/lib/supabase/server';

import { DOCUMENT_TYPES, isClientVisibleDocumentType } from './types';
import { CONFIDENCE_THRESHOLD, parseReconciliation } from './reconciliation';

// Publication (INITIAL_PROMPT.md §8 statuses, §3 financial integrity).
// Publishing flips the document, its reports and bank statements to
// `published` in one go, and supersedes any older published report for the
// same business / type / period. Unpublishing reverses the visibility; nothing
// is ever deleted. Both are strict: unreconciled or low-confidence data cannot
// be published — the firm corrects lines instead. The checks run here; the
// writes are one transaction each in Postgres (0029), so a failure part-way can
// no longer leave the document and the figures the client sees disagreeing.
const idSchema = z.object({ documentId: z.string().uuid() });
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const metaSchema = z.object({
  documentId: z.string().uuid(),
  documentType: z.enum(DOCUMENT_TYPES),
  title: z.string().trim().min(1).max(160),
  periodStart: z.union([isoDate, z.literal('')]),
  periodEnd: z.union([isoDate, z.literal('')]),
});

export type PublishBlocker =
  | 'publishBlockedStatus'
  | 'publishBlockedReconciliation'
  | 'publishBlockedLowConfidence'
  | 'publishBlockedNoData'
  | LedgerBlocker;

type Db = Awaited<ReturnType<typeof createClient>>;

/** What publish_document_version (0029) reports back. */
const publishedSchema = z.object({
  title: z.string(),
  document_type: z.string(),
  reports: z.number(),
  superseded: z.number(),
  replaced_version: z.boolean(),
});

/**
 * The version the firm reviews and publishes next, which is not always the one
 * the client is seeing.
 *
 * `current_version_id` is the publication pointer, and it deliberately does not
 * move while a document is published — history is never hidden. Deriving the
 * review target from it as well made replacing a published document a dead end:
 * v2 uploaded, processed and created its own reports, but the review page and
 * publishBlockers both looked at v1, so the reviewer corrected and re-published
 * v1 while v2 sat unreachable for good.
 */
export async function reviewVersion(
  supabase: Db,
  documentId: string,
  fallback: string | null = null,
): Promise<string | null> {
  const { data } = await supabase
    .from('document_versions')
    .select('id')
    .eq('document_id', documentId)
    .eq('upload_status', 'uploaded')
    .order('version_no', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.id ?? fallback;
}

// Everything that must be true before a version can go to the client.
export async function publishBlockers(
  supabase: Db,
  documentId: string,
): Promise<{
  blockers: PublishBlocker[];
  versionId: string | null;
  entityId: string | null;
  /** The ledger accounts behind the P&L's lines, sub-accounts of a collapsed parent included: what publishing lets the client read. */
  visibleLedgerAccounts: string[];
}> {
  const { data: doc } = await supabase
    .from('documents')
    .select('id, status, current_version_id, business_entity_id')
    .eq('id', documentId)
    .maybeSingle();
  if (!doc) return { blockers: ['publishBlockedNoData'], versionId: null, entityId: null, visibleLedgerAccounts: [] };

  const reviewVersionId = await reviewVersion(supabase, documentId, doc.current_version_id);
  if (!reviewVersionId) {
    return { blockers: ['publishBlockedNoData'], versionId: null, entityId: doc.business_entity_id, visibleLedgerAccounts: [] };
  }

  const blockers = new Set<PublishBlocker>();
  if (!['reconciled', 'ready_to_publish', 'published'].includes(doc.status)) {
    blockers.add('publishBlockedStatus');
  }

  // Everything a version can produce. Tax filings and payroll summaries are as
  // publishable as a statement — leaving them out meant a document that yields
  // only tax rows looked empty, so it could never be published and the client's
  // Taxes pages could only ever show seed data. Point-of-sale reports were left
  // out the same way and it bit the same way: a sales report's own passing
  // reconciliation was never read, and once the obligation stopped carrying its
  // version (see persistSalesReport) the document had nothing derived at all.
  const [{ data: reports }, { data: statements }, { data: taxes }, { data: payroll }, { data: sales }, { data: payments }, { data: ledgers }] =
    await Promise.all([
      supabase
        .from('financial_reports')
        .select('id, reconciliation')
        .eq('document_version_id', reviewVersionId),
      supabase
        .from('bank_statements')
        .select('id, reconciliation')
        .eq('document_version_id', reviewVersionId),
      supabase
        .from('tax_obligations')
        .select('id, reconciliation')
        .eq('document_version_id', reviewVersionId),
      supabase
        .from('payroll_obligations')
        .select('id, reconciliation')
        .eq('document_version_id', reviewVersionId),
      supabase
        .from('sales_reports')
        .select('id, reconciliation')
        .eq('document_version_id', reviewVersionId),
      supabase.from('tax_payments').select('id').eq('document_version_id', reviewVersionId),
      supabase
        .from('general_ledgers')
        .select('id, business_entity_id, period_start, period_end, basis, reconciliation')
        .eq('document_version_id', reviewVersionId),
    ]);
  const derived = [
    ...(reports ?? []),
    ...(statements ?? []),
    ...(taxes ?? []),
    ...(payroll ?? []),
    ...(sales ?? []),
    ...(ledgers ?? []),
  ];
  // A payment confirmation produces payment rows and no obligation of its own
  // — the obligation belongs to the return (lib/ingestion/tax-roles.ts). A
  // payment carries no reconciliation to gate on; the document's status does
  // that, and it is only `reconciled` when the extraction's own checks passed.
  if (derived.length === 0 && (payments ?? []).length === 0) blockers.add('publishBlockedNoData');

  for (const row of derived) {
    const rec = parseReconciliation(row.reconciliation);
    if (!rec || !rec.passed) blockers.add('publishBlockedReconciliation');
  }

  if ((reports ?? []).length > 0) {
    const { count } = await supabase
      .from('financial_statement_lines')
      .select('id', { count: 'exact', head: true })
      .in('report_id', (reports ?? []).map((r) => r.id))
      .lt('confidence', CONFIDENCE_THRESHOLD)
      .is('corrected_at', null);
    if ((count ?? 0) > 0) blockers.add('publishBlockedLowConfidence');
  }

  // A ledger also has to explain the published P&L of its month, to the cent
  // (lib/ledger/review.ts) — its own arithmetic passing is not enough.
  const visibleLedgerAccounts: string[] = [];
  for (const ledger of ledgers ?? []) {
    const { blocker, match } = await reviewLedger(supabase, ledger);
    if (blocker) blockers.add(blocker);
    for (const line of match?.lines ?? []) if (line.status === 'matched') visibleLedgerAccounts.push(...line.accountIds);
  }

  return { blockers: [...blockers], versionId: reviewVersionId, entityId: doc.business_entity_id, visibleLedgerAccounts };
}

export async function publishDocument(input: unknown): Promise<ActionResult> {
  const t = await getTranslations('Admin');
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: t('errorInvalid') };
  await requireFirmAdmin();
  const supabase = await createClient();

  const { blockers, versionId, entityId, visibleLedgerAccounts } = await publishBlockers(supabase, parsed.data.documentId);
  if (blockers.length > 0 || !versionId) return { ok: false, error: t(blockers[0] ?? 'errorSave') };

  // Supersedes, ledger visibility, the stamps on every derived table and the
  // document itself, in one transaction (0029). The superseded count goes into
  // the audit entry (identifiers and counts only) so a replacement is traceable
  // from the trail, not only from the document's report history.
  const { data, error } = await supabase.rpc('publish_document_version', {
    p_document_id: parsed.data.documentId,
    p_version_id: versionId,
    p_visible_ledger_accounts: [...new Set(visibleLedgerAccounts)],
  });
  const published = publishedSchema.safeParse(data);
  if (error || !published.success) {
    console.error('[publish] publish failed', parsed.data.documentId, error?.code ?? 'shape');
    return { ok: false, error: t('errorSave') };
  }
  const result = published.data;

  // A firm-only document (0025) has no tile and no download for the client, so
  // the bell must not name it either — its figures reach them silently, the way
  // the register numbers on their Sales Taxes page always have. The document is
  // published by now, so a failed notification is logged rather than reported
  // as a failed publish.
  if (entityId && isClientVisibleDocumentType(result.document_type)) {
    // A republish is still a publication for the client — same channel, but the
    // bell says "updated" so a corrected statement does not read as a new one.
    try {
      await notifyEntityMembers({
        entityId,
        kind: 'document.published',
        title: result.title,
        linkPath: '/dashboard',
        payload: { replaced: result.superseded > 0 || result.replaced_version ? 'true' : 'false' },
      });
    } catch (notifyError) {
      console.error('[publish] notify failed', parsed.data.documentId, notifyError instanceof Error ? notifyError.message : 'unknown');
    }
  }

  await logAccess({
    action: 'document.publish',
    resourceType: 'document',
    resourceId: parsed.data.documentId,
    businessEntityId: entityId,
    metadata: { version_id: versionId, reports: result.reports, superseded: result.superseded },
  });
  revalidatePath('/admin/documents');
  revalidatePath(`/admin/documents/${parsed.data.documentId}`);
  return { ok: true, value: undefined };
}

export async function unpublishDocument(input: unknown): Promise<ActionResult> {
  const t = await getTranslations('Admin');
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: t('errorInvalid') };
  await requireFirmAdmin();
  const supabase = await createClient();

  const { data: doc } = await supabase
    .from('documents')
    .select('id, status, business_entity_id, document_type')
    .eq('id', parsed.data.documentId)
    .maybeSingle();
  if (!doc || doc.status !== 'published') return { ok: false, error: t('errorInvalid') };

  // Withdraw everything publishing stamped, or the client keeps seeing figures
  // from a document the firm has retracted. Publishing writes to five tables;
  // this used to reverse two, so a withdrawn sales-tax filing left its
  // obligations `published_at` and visible — and, because the delete guard in
  // 0020 reads exactly those rows, the document could then never be deleted
  // either. One transaction (0029), scoped to every version of the document
  // rather than `current_version_id`: publication stamps the *review* version,
  // which is not always the one the pointer names (see reviewVersion).
  const { data, error } = await supabase.rpc('unpublish_document', { p_document_id: doc.id });
  if (error) {
    console.error('[publish] unpublish failed', doc.id, error.code);
    return { ok: false, error: t('errorSave') };
  }
  const withdrawn = z.object({ title: z.string() }).safeParse(data);
  if (!withdrawn.success) return { ok: false, error: t('errorInvalid') };

  // The client had this report and no longer does; that belongs on the document
  // activity channel they opted into, not silently in the background. A
  // firm-only document (0025) was never in their portal, so there is nothing to
  // tell them it has left.
  if (doc.business_entity_id && isClientVisibleDocumentType(doc.document_type)) {
    try {
      await notifyEntityMembers({
        entityId: doc.business_entity_id,
        kind: 'document.unpublished',
        title: withdrawn.data.title,
        linkPath: '/reports',
      });
    } catch (notifyError) {
      console.error('[publish] notify failed', doc.id, notifyError instanceof Error ? notifyError.message : 'unknown');
    }
  }

  await logAccess({
    action: 'document.unpublish',
    resourceType: 'document',
    resourceId: doc.id,
    businessEntityId: doc.business_entity_id,
  });
  revalidatePath('/admin/documents');
  revalidatePath(`/admin/documents/${doc.id}`);
  return { ok: true, value: undefined };
}

// The admin confirms what the pipeline detected (type, period, title).
export async function confirmDocumentMeta(input: unknown): Promise<ActionResult> {
  const t = await getTranslations('Admin');
  const parsed = metaSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: t('errorInvalid') };
  await requireFirmAdmin();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('documents')
    .update({
      document_type: parsed.data.documentType,
      title: parsed.data.title,
      period_start: parsed.data.periodStart || null,
      period_end: parsed.data.periodEnd || null,
    })
    .eq('id', parsed.data.documentId)
    .select('id, business_entity_id');
  const doc = data?.[0];
  if (error || !doc) return { ok: false, error: t('errorSave') };

  await logAccess({
    action: 'document.confirm_meta',
    resourceType: 'document',
    resourceId: doc.id,
    businessEntityId: doc.business_entity_id,
  });
  revalidatePath(`/admin/documents/${doc.id}`);
  return { ok: true, value: undefined };
}
