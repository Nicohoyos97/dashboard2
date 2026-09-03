'use server';

import { createHash } from 'node:crypto';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { z } from 'zod';

import { logAccess } from '@/lib/audit/logAccess';
import { requireFirmAdmin } from '@/lib/auth/requireFirm';
import type { ActionResult } from '@/lib/firm/result';
import { isIngestionError } from '@/lib/ingestion/errors';
import { getPageCount } from '@/lib/ingestion/pdf';
import { RATE_LIMITS, consumeRateLimit } from '@/lib/rate-limit';
import { createClient } from '@/lib/supabase/server';

import { DOCUMENT_TYPES, MAX_UPLOAD_BYTES, UPLOAD_MIME_TYPES, safeFilename } from './types';

// Upload flow (docs/PLAN.md §3.3): the browser never sends bytes through the
// server. createDocumentDraft() reserves the rows + storage path, the browser
// uploads straight to the private bucket (firm-admin storage policy), then
// finalizeDocumentUpload() validates what landed — magic bytes, page count,
// checksum, duplicates — and enqueues the processing job.
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const draftSchema = z.object({
  entityId: z.string().uuid(),
  documentId: z.string().uuid().optional(),
  documentType: z.enum(DOCUMENT_TYPES),
  title: z.string().trim().min(1).max(160),
  periodStart: isoDate.optional(),
  periodEnd: isoDate.optional(),
  filename: z.string().min(1).max(255),
  sizeBytes: z.number().int().min(1).max(MAX_UPLOAD_BYTES),
  mimeType: z.enum(UPLOAD_MIME_TYPES),
});

const finalizeSchema = z.object({ versionId: z.string().uuid() });
const retrySchema = z.object({ jobId: z.string().uuid() });

export type DraftResult = { documentId: string; versionId: string; storagePath: string };

export async function createDocumentDraft(input: unknown): Promise<ActionResult<DraftResult>> {
  const t = await getTranslations('Admin');
  const parsed = draftSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: t('errorInvalid') };
  const firm = await requireFirmAdmin();
  if (!(await consumeRateLimit(`upload:${firm.userId}`, RATE_LIMITS.upload))) {
    return { ok: false, error: t('errorRateLimited') };
  }

  const supabase = await createClient();
  const d = parsed.data;
  let documentId = d.documentId ?? null;
  let versionNo = 1;

  if (documentId) {
    const { data: existing } = await supabase
      .from('documents')
      .select('id, business_entity_id')
      .eq('id', documentId)
      .maybeSingle();
    if (!existing || existing.business_entity_id !== d.entityId) {
      return { ok: false, error: t('errorInvalid') };
    }
    const { data: last } = await supabase
      .from('document_versions')
      .select('version_no')
      .eq('document_id', documentId)
      .order('version_no', { ascending: false })
      .limit(1)
      .maybeSingle();
    versionNo = (last?.version_no ?? 0) + 1;
  } else {
    const { data: doc, error } = await supabase
      .from('documents')
      .insert({
        business_entity_id: d.entityId,
        document_type: d.documentType,
        title: d.title,
        period_start: d.periodStart ?? null,
        period_end: d.periodEnd ?? null,
        status: 'uploaded',
        created_by: firm.userId,
      })
      .select('id')
      .single();
    if (error || !doc) return { ok: false, error: t('errorSave') };
    documentId = doc.id;
  }

  const filename = safeFilename(d.filename);
  const storagePath = `${d.entityId}/${documentId}/v${versionNo}/${filename}`;
  const { data: version, error: versionError } = await supabase
    .from('document_versions')
    .insert({
      document_id: documentId,
      business_entity_id: d.entityId,
      version_no: versionNo,
      storage_path: storagePath,
      original_filename: filename,
      mime_type: d.mimeType,
      size_bytes: d.sizeBytes,
      upload_status: 'uploading',
      uploaded_by: firm.userId,
    })
    .select('id')
    .single();
  if (versionError || !version) return { ok: false, error: t('errorSave') };

  return { ok: true, value: { documentId, versionId: version.id, storagePath } };
}

// Cheap sanity check for CSV uploads: text (no NUL bytes), a header row and at
// least one data row, comma or semicolon separated. Real parsing happens in
// the pipeline.
function looksLikeCsv(buffer: Buffer): boolean {
  const head = buffer.subarray(0, 4096).toString('utf8');
  if (head.includes('\u0000')) return false;
  const lines = head.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const header = lines[0] ?? '';
  return lines.length >= 2 && (header.includes(',') || header.includes(';'));
}

export async function finalizeDocumentUpload(
  input: unknown,
): Promise<ActionResult<{ documentId: string }>> {
  const t = await getTranslations('Admin');
  const parsed = finalizeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: t('errorInvalid') };
  await requireFirmAdmin();

  const supabase = await createClient();
  const { data: version } = await supabase
    .from('document_versions')
    .select('id, document_id, business_entity_id, storage_path, mime_type, version_no')
    .eq('id', parsed.data.versionId)
    .eq('upload_status', 'uploading')
    .maybeSingle();
  if (!version) return { ok: false, error: t('errorInvalid') };

  const reject = async (code: string): Promise<ActionResult<{ documentId: string }>> => {
    await supabase
      .from('document_versions')
      .update({ upload_status: 'rejected', reject_code: code })
      .eq('id', version.id);
    return { ok: false, error: t(`reject_${code}`) };
  };

  const { data: blob, error: downloadError } = await supabase.storage
    .from('documents')
    .download(version.storage_path);
  if (downloadError || !blob) return reject('missing_object');
  const buffer = Buffer.from(await blob.arrayBuffer());

  let pageCount: number | null = null;
  if (version.mime_type === 'application/pdf') {
    try {
      pageCount = await getPageCount(buffer);
    } catch (error) {
      return reject(isIngestionError(error) ? error.code : 'pdf_invalid');
    }
  } else if (!looksLikeCsv(buffer)) {
    return reject('csv_unparseable');
  }

  const sha256 = createHash('sha256').update(buffer).digest('hex');
  const { data: duplicate } = await supabase
    .from('document_versions')
    .select('id')
    .eq('business_entity_id', version.business_entity_id)
    .eq('sha256', sha256)
    .eq('upload_status', 'uploaded')
    .neq('id', version.id)
    .maybeSingle();
  if (duplicate) return reject('duplicate');

  const { error: updateError } = await supabase
    .from('document_versions')
    .update({ sha256, page_count: pageCount, upload_status: 'uploaded' })
    .eq('id', version.id);
  if (updateError) return reject(updateError.code === '23505' ? 'duplicate' : 'save_failed');

  // A replacement of a published document keeps the published version current
  // until the new one is reviewed and published (history is never hidden).
  const { data: doc } = await supabase
    .from('documents')
    .select('status')
    .eq('id', version.document_id)
    .maybeSingle();
  if (doc?.status !== 'published') {
    await supabase
      .from('documents')
      .update({ current_version_id: version.id, status: 'uploaded' })
      .eq('id', version.document_id);
  }

  await supabase.from('document_processing_jobs').insert({
    business_entity_id: version.business_entity_id,
    document_version_id: version.id,
  });

  await logAccess({
    action: 'document.upload',
    resourceType: 'document_version',
    resourceId: version.id,
    businessEntityId: version.business_entity_id,
    metadata: { version_no: version.version_no, pages: pageCount },
  });
  revalidatePath('/admin/documents');
  revalidatePath(`/admin/documents/${version.document_id}`);
  return { ok: true, value: { documentId: version.document_id } };
}

export async function retryJob(input: unknown): Promise<ActionResult> {
  const t = await getTranslations('Admin');
  const parsed = retrySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: t('errorInvalid') };
  await requireFirmAdmin();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('document_processing_jobs')
    .update({
      status: 'pending',
      attempts: 0,
      error_code: null,
      locked_at: null,
      run_after: new Date().toISOString(),
    })
    .eq('id', parsed.data.jobId)
    .in('status', ['failed', 'succeeded'])
    .select('id, document_version_id, business_entity_id');
  const job = data?.[0];
  if (error || !job) return { ok: false, error: t('errorSave') };

  await logAccess({
    action: 'job.retry',
    resourceType: 'document_processing_job',
    resourceId: job.id,
    businessEntityId: job.business_entity_id,
  });
  revalidatePath('/admin/documents');
  return { ok: true, value: undefined };
}
