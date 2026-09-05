'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { z } from 'zod';

import { logAccess } from '@/lib/audit/logAccess';
import { requireFirmAdmin } from '@/lib/auth/requireFirm';
import type { ActionResult } from '@/lib/firm/result';
import { notifyEntityMembers } from '@/lib/notifications/notify';
import { createClient } from '@/lib/supabase/server';

import { DOCUMENT_TYPES } from './types';
import { CONFIDENCE_THRESHOLD, parseReconciliation } from './reconciliation';

// Publication (INITIAL_PROMPT.md §8 statuses, §3 financial integrity).
// Publishing flips the document, its reports and bank statements to
// `published` in one go, and supersedes any older published report for the
// same business / type / period. Unpublishing reverses the visibility; nothing
// is ever deleted. Both are strict: unreconciled or low-confidence data cannot
// be published — the firm corrects lines instead.
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
  | 'publishBlockedNoData';

type Db = Awaited<ReturnType<typeof createClient>>;

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
): Promise<{ blockers: PublishBlocker[]; versionId: string | null; entityId: string | null }> {
  const { data: doc } = await supabase
    .from('documents')
    .select('id, status, current_version_id, business_entity_id')
    .eq('id', documentId)
    .maybeSingle();
  if (!doc) return { blockers: ['publishBlockedNoData'], versionId: null, entityId: null };

  const reviewVersionId = await reviewVersion(supabase, documentId, doc.current_version_id);
  if (!reviewVersionId) {
    return { blockers: ['publishBlockedNoData'], versionId: null, entityId: doc.business_entity_id };
  }

  const blockers = new Set<PublishBlocker>();
  if (!['reconciled', 'ready_to_publish', 'published'].includes(doc.status)) {
    blockers.add('publishBlockedStatus');
  }

  // Everything a version can produce. Tax filings and payroll summaries are as
  // publishable as a statement — leaving them out meant a document that yields
  // only tax rows looked empty, so it could never be published and the client's
  // Taxes pages could only ever show seed data.
  const [{ data: reports }, { data: statements }, { data: taxes }, { data: payroll }] =
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
    ]);
  const derived = [...(reports ?? []), ...(statements ?? []), ...(taxes ?? []), ...(payroll ?? [])];
  if (derived.length === 0) blockers.add('publishBlockedNoData');

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

  return { blockers: [...blockers], versionId: reviewVersionId, entityId: doc.business_entity_id };
}

export async function publishDocument(input: unknown): Promise<ActionResult> {
  const t = await getTranslations('Admin');
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: t('errorInvalid') };
  const firm = await requireFirmAdmin();
  const supabase = await createClient();

  const { blockers, versionId, entityId } = await publishBlockers(supabase, parsed.data.documentId);
  if (blockers.length > 0 || !versionId) return { ok: false, error: t(blockers[0] ?? 'errorSave') };

  const now = new Date().toISOString();
  const { data: reports } = await supabase
    .from('financial_reports')
    .select('id, business_entity_id, report_type, period_start, period_end')
    .eq('document_version_id', versionId);

  // Supersede older published reports covering the same statement. The count
  // goes into the audit entry (identifiers and counts only) so a replacement is
  // traceable from the trail, not only from the document's report history.
  let supersededCount = 0;
  for (const report of reports ?? []) {
    const { data: older } = await supabase
      .from('financial_reports')
      .select('id')
      .eq('business_entity_id', report.business_entity_id)
      .eq('report_type', report.report_type)
      .eq('period_start', report.period_start)
      .eq('period_end', report.period_end)
      .eq('status', 'published')
      .neq('id', report.id);
    for (const old of older ?? []) {
      const { error: supersedeError } = await supabase
        .from('financial_reports')
        .update({ status: 'superseded', published_at: null, superseded_by: report.id })
        .eq('id', old.id);
      if (!supersedeError) supersededCount += 1;
    }
  }

  const publishRow = { status: 'published', published_at: now, published_by: firm.userId };
  // tax_obligations / tax_payments / payroll_obligations have no `status`
  // column: publication is `published_at` alone, and every reader gates on it.
  const stamp = { published_at: now, published_by: firm.userId };
  await supabase.from('financial_reports').update(publishRow).eq('document_version_id', versionId);
  await supabase.from('bank_statements').update(publishRow).eq('document_version_id', versionId);
  await supabase.from('tax_obligations').update(stamp).eq('document_version_id', versionId);
  await supabase.from('tax_payments').update(stamp).eq('document_version_id', versionId);
  await supabase.from('payroll_obligations').update(stamp).eq('document_version_id', versionId);

  // A replaced version: the previous current version is marked superseded.
  const { data: doc } = await supabase
    .from('documents')
    .select('current_version_id')
    .eq('id', parsed.data.documentId)
    .maybeSingle();
  const replacedVersion = Boolean(doc?.current_version_id && doc.current_version_id !== versionId);
  if (replacedVersion && doc?.current_version_id) {
    await supabase
      .from('document_versions')
      .update({ superseded_at: now })
      .eq('id', doc.current_version_id);
  }
  const { data: published, error } = await supabase
    .from('documents')
    .update({ ...publishRow, current_version_id: versionId })
    .eq('id', parsed.data.documentId)
    .select('title');
  if (error || !published?.[0]) return { ok: false, error: t('errorSave') };

  if (entityId) {
    // A republish is still a publication for the client — same channel, but the
    // bell says "updated" so a corrected statement does not read as a new one.
    await notifyEntityMembers({
      entityId,
      kind: 'document.published',
      title: published[0].title,
      linkPath: '/dashboard',
      payload: { replaced: supersededCount > 0 || replacedVersion ? 'true' : 'false' },
    });
  }

  await logAccess({
    action: 'document.publish',
    resourceType: 'document',
    resourceId: parsed.data.documentId,
    businessEntityId: entityId,
    metadata: { version_id: versionId, reports: (reports ?? []).length, superseded: supersededCount },
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
    .select('id, status, current_version_id, business_entity_id')
    .eq('id', parsed.data.documentId)
    .maybeSingle();
  if (!doc || doc.status !== 'published') return { ok: false, error: t('errorInvalid') };

  const hidden = { status: 'reconciled', published_at: null, published_by: null };
  // Withdraw everything publishing stamped, or the client keeps seeing figures
  // from a document the firm has retracted. Publishing writes to five tables;
  // this used to reverse two, so a withdrawn sales-tax filing left its
  // obligations `published_at` and visible — and, because the delete guard in
  // 0020 reads exactly those rows, the document could then never be deleted
  // either. Scoped to every version of the document rather than
  // `current_version_id`: publication stamps the *review* version, which is not
  // always the one the pointer names (see reviewVersion).
  const { data: allVersions } = await supabase
    .from('document_versions')
    .select('id')
    .eq('document_id', doc.id);
  const versionIds = (allVersions ?? []).map((v) => v.id);
  if (versionIds.length > 0) {
    const unstamp = { published_at: null, published_by: null };
    await supabase.from('financial_reports').update(hidden).in('document_version_id', versionIds).eq('status', 'published');
    await supabase.from('bank_statements').update(hidden).in('document_version_id', versionIds).eq('status', 'published');
    // These three carry publication in `published_at` alone — no status column.
    await supabase.from('tax_obligations').update(unstamp).in('document_version_id', versionIds);
    await supabase.from('tax_payments').update(unstamp).in('document_version_id', versionIds);
    await supabase.from('payroll_obligations').update(unstamp).in('document_version_id', versionIds);
  }
  const { data: withdrawn, error } = await supabase.from('documents').update(hidden).eq('id', doc.id).select('title');
  if (error) return { ok: false, error: t('errorSave') };

  // The client had this report and no longer does; that belongs on the document
  // activity channel they opted into, not silently in the background.
  if (doc.business_entity_id && withdrawn?.[0]) {
    await notifyEntityMembers({
      entityId: doc.business_entity_id,
      kind: 'document.unpublished',
      title: withdrawn[0].title,
      linkPath: '/reports',
    });
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
