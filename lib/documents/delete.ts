'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { z } from 'zod';

import { logAccess } from '@/lib/audit/logAccess';
import { requireFirmAdmin } from '@/lib/auth/requireFirm';
import type { ActionResult } from '@/lib/firm/result';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

import { clearDerived } from '@/lib/ingestion/persist';

// Deleting an uploaded document (migration 0020). The case this exists for is
// a failed upload session — files that could never be published and the
// half-processed rows behind them — not published financial history, which is
// withdrawn and kept.
//
// Two things have to be true, and the database is where both are enforced:
// the document is not published (policy `documents_admin_delete`), and nothing
// published derives from any of its versions (trigger `documents_guard_delete`).
// The blockers below are the same two questions asked ahead of time, so the
// button can say why it is disabled instead of failing on click.
const idSchema = z.object({ documentId: z.string().uuid() });

export type DeleteBlocker = 'deleteBlockedPublished' | 'deleteBlockedDerived' | 'deleteBlockedMissing';

type Db = Awaited<ReturnType<typeof createClient>>;

/** Rows that are published and point at a version of this document. */
async function publishedDerivedCount(supabase: Db, versionIds: string[]): Promise<number> {
  if (versionIds.length === 0) return 0;
  const counts = await Promise.all([
    supabase.from('financial_reports').select('id', { count: 'exact', head: true }).in('document_version_id', versionIds).eq('status', 'published'),
    supabase.from('bank_statements').select('id', { count: 'exact', head: true }).in('document_version_id', versionIds).eq('status', 'published'),
    supabase.from('tax_obligations').select('id', { count: 'exact', head: true }).in('document_version_id', versionIds).not('published_at', 'is', null),
    supabase.from('tax_payments').select('id', { count: 'exact', head: true }).in('document_version_id', versionIds).not('published_at', 'is', null),
    supabase.from('payroll_obligations').select('id', { count: 'exact', head: true }).in('document_version_id', versionIds).not('published_at', 'is', null),
    supabase.from('reminders').select('id', { count: 'exact', head: true }).in('document_version_id', versionIds).not('published_at', 'is', null),
  ]);
  return counts.reduce((total, r) => total + (r.count ?? 0), 0);
}

/**
 * Every version of a document.
 *
 * Read on its own rather than embedded: `documents` and `document_versions`
 * are joined twice — `document_versions.document_id` one way and
 * `documents.current_version_id` the other — so an embedded select resolves to
 * the pointer and hands back a single row instead of the list.
 */
async function versionsOf(supabase: Db, documentId: string) {
  const { data } = await supabase
    .from('document_versions')
    .select('id, storage_path')
    .eq('document_id', documentId);
  return data ?? [];
}

export async function deleteBlockers(
  supabase: Db,
  documentId: string,
): Promise<{ blockers: DeleteBlocker[]; derivedCount: number }> {
  const { data: doc } = await supabase
    .from('documents')
    .select('id, published_at')
    .eq('id', documentId)
    .maybeSingle();
  if (!doc) return { blockers: ['deleteBlockedMissing'], derivedCount: 0 };

  const blockers: DeleteBlocker[] = [];
  if (doc.published_at !== null) blockers.push('deleteBlockedPublished');

  const versions = await versionsOf(supabase, documentId);
  const derivedCount = await publishedDerivedCount(supabase, versions.map((v) => v.id));
  if (derivedCount > 0) blockers.push('deleteBlockedDerived');

  return { blockers, derivedCount };
}

/**
 * Delete a document, its versions, its unpublished derived rows and its files.
 *
 * Order matters. The row goes first, because the trigger is the real gate and
 * a refusal has to happen before anything irreversible does — removing the
 * files first and then failing the delete would leave a document pointing at
 * bytes that no longer exist. Storage comes last: a leftover object with no
 * row is invisible and can be swept, which is the cheaper of the two failures.
 */
export async function deleteDocument(input: unknown): Promise<ActionResult> {
  const t = await getTranslations('Admin');
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: t('errorInvalid') };

  await requireFirmAdmin();
  const supabase = await createClient();

  const { data: doc } = await supabase
    .from('documents')
    .select('id, title, business_entity_id, published_at')
    .eq('id', parsed.data.documentId)
    .maybeSingle();
  if (!doc) return { ok: false, error: t('errorInvalid') };

  const versions = await versionsOf(supabase, doc.id);
  const { blockers, derivedCount } = await deleteBlockers(supabase, doc.id);
  if (blockers.includes('deleteBlockedPublished')) return { ok: false, error: t('deleteBlockedPublished') };
  if (blockers.includes('deleteBlockedDerived')) {
    return { ok: false, error: t('deleteBlockedDerived', { count: derivedCount }) };
  }

  // The unpublished rows this document produced: reports, bank statements and
  // tax obligations that never reached the client. clearDerived is the same
  // routine the worker uses to make reprocessing idempotent.
  const admin = createAdminClient();
  for (const version of versions) await clearDerived(admin, version.id);

  // RLS (documents_admin_delete) and the trigger are the controls; the checks
  // above only shape the message.
  const { error, count } = await supabase
    .from('documents')
    .delete({ count: 'exact' })
    .eq('id', doc.id);
  if (error || count === 0) return { ok: false, error: t('deleteFailed') };

  const paths = versions.map((v) => v.storage_path).filter((p): p is string => Boolean(p));
  if (paths.length > 0) {
    const { error: storageError } = await supabase.storage.from('documents').remove(paths);
    // The record is already gone; a stranded object is a cleanup task, not a
    // reason to tell the firm the deletion failed.
    if (storageError) console.error('[documents] storage remove failed after delete');
  }

  await logAccess({
    action: 'document.delete',
    resourceType: 'document',
    resourceId: doc.id,
    businessEntityId: doc.business_entity_id,
    metadata: { versions: versions.length, files: paths.length },
  });
  revalidatePath('/admin/documents');
  revalidatePath(`/admin/documents/${doc.id}`);
  return { ok: true, value: undefined };
}
