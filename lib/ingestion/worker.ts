// The document-processing worker (docs/PLAN.md §3.4). Claims pending jobs
// through claim_processing_jobs() (service role, FOR UPDATE SKIP LOCKED),
// runs the pure pipeline on the stored bytes and persists the result. Every
// query names the job's business_entity_id. Failures store an error code —
// never document content — and retry with backoff until max_attempts.
import 'server-only';

import Anthropic from '@anthropic-ai/sdk';

import { getAnthropic } from '@/lib/ai/client';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Database } from '@/lib/supabase/types';

import { isIngestionError } from './errors';
import { WorkerError, clearDerived, persistCsv, persistPipelineOutput } from './persist';
import type { PersistContext, PersistSummary } from './persist';
import { runPdfPipeline } from './pipeline';
import type { ExtractableType } from './pipeline';

type Job = Database['public']['Tables']['document_processing_jobs']['Row'];
type Admin = ReturnType<typeof createAdminClient>;

export type JobOutcome = { jobId: string; status: 'succeeded' | 'failed' | 'retry'; errorCode?: string };
export type WorkerSummary = { claimed: number; processed: number; outcomes: JobOutcome[] };

const EXPECTED_TYPE: Record<string, ExtractableType | undefined> = {
  bank_statement: 'bank_statement',
  profit_and_loss: 'profit_and_loss',
  balance_sheet: 'balance_sheet',
  sales_report: 'sales_report',
  sales_tax_filing: 'sales_tax',
  sales_tax_payment: 'sales_tax',
  income_tax_document: 'income_tax',
  payroll_summary: 'payroll',
};

function errorCode(error: unknown): string {
  if (isIngestionError(error)) return error.code;
  if (error instanceof WorkerError) return error.code;
  if (error instanceof Anthropic.APIError) return `api_${error.status ?? 'error'}`;
  return 'worker_error';
}

async function setJob(admin: Admin, jobId: string, patch: Database['public']['Tables']['document_processing_jobs']['Update']): Promise<void> {
  await admin.from('document_processing_jobs').update(patch).eq('id', jobId);
}

async function setDocumentStatus(admin: Admin, documentId: string, status: string): Promise<void> {
  await admin.from('documents').update({ status }).eq('id', documentId).neq('status', 'published');
}

async function processJob(admin: Admin, job: Job): Promise<JobOutcome> {
  const { data: version } = await admin
    .from('document_versions')
    .select('id, document_id, business_entity_id, storage_path, mime_type, upload_status')
    .eq('id', job.document_version_id)
    .maybeSingle();
  const { data: doc } = version
    ? await admin
        .from('documents')
        .select('id, document_type, status, period_start, period_end, business_entities ( currency )')
        .eq('id', version.document_id)
        .maybeSingle()
    : { data: null };

  if (!version || !doc || version.upload_status !== 'uploaded' || version.business_entity_id !== job.business_entity_id) {
    await setJob(admin, job.id, { status: 'failed', error_code: 'version_unavailable', locked_at: null, finished_at: new Date().toISOString() });
    return { jobId: job.id, status: 'failed', errorCode: 'version_unavailable' };
  }

  const ctx: PersistContext = {
    versionId: version.id,
    documentId: doc.id,
    entityId: version.business_entity_id,
    currency: doc.business_entities?.currency ?? 'USD',
  };

  try {
    await setDocumentStatus(admin, doc.id, 'processing');
    await setJob(admin, job.id, { step: 'split' });

    const { data: blob, error: downloadError } = await admin.storage.from('documents').download(version.storage_path);
    if (downloadError || !blob) throw new WorkerError('storage_download');
    const buffer = Buffer.from(await blob.arrayBuffer());

    await clearDerived(admin, version.id);
    await setJob(admin, job.id, { step: 'classify' });

    let summary: PersistSummary;
    if (version.mime_type === 'application/pdf') {
      const output = await runPdfPipeline({
        pdf: buffer,
        anthropic: getAnthropic(),
        expectedType: EXPECTED_TYPE[doc.document_type],
      });
      await setJob(admin, job.id, { step: 'extract' });
      summary = await persistPipelineOutput(admin, ctx, output);
      await fillDocumentMeta(admin, doc, output);
    } else {
      await setJob(admin, job.id, { step: 'extract' });
      summary = await persistCsv(admin, ctx, buffer.toString('utf8'), getAnthropic());
    }

    await setJob(admin, job.id, { step: 'reconcile' });
    await setDocumentStatus(admin, doc.id, summary.passed ? 'reconciled' : 'needs_review');
    await setJob(admin, job.id, {
      status: 'succeeded',
      step: 'done',
      error_code: summary.warnings.length > 0 ? `warnings:${summary.warnings.length}` : null,
      locked_at: null,
      finished_at: new Date().toISOString(),
    });
    return { jobId: job.id, status: 'succeeded' };
  } catch (error) {
    const code = errorCode(error);
    const final = job.attempts >= job.max_attempts;
    console.error('[worker] job failed', job.id, code);
    await setJob(admin, job.id, {
      status: final ? 'failed' : 'pending',
      error_code: code,
      locked_at: null,
      run_after: new Date(Date.now() + 60_000 * 2 ** job.attempts).toISOString(),
      finished_at: final ? new Date().toISOString() : null,
    });
    if (final) await setDocumentStatus(admin, doc.id, 'failed');
    return { jobId: job.id, status: final ? 'failed' : 'retry', errorCode: code };
  }
}

// What the pipeline detected fills in whatever the admin left blank at upload
// time (type, period); the admin still confirms it in review.
async function fillDocumentMeta(
  admin: Admin,
  doc: { id: string; document_type: string; period_start: string | null; period_end: string | null },
  output: Awaited<ReturnType<typeof runPdfPipeline>>,
): Promise<void> {
  const first = output.results[0];
  if (!first || output.results.length !== 1) return;
  const patch: Database['public']['Tables']['documents']['Update'] = {};
  if (first.kind === 'financial_statement') {
    if (doc.document_type === 'statement_package' || doc.document_type === 'other_report') patch.document_type = first.data.report_type;
    if (!doc.period_start) patch.period_start = first.data.period_start;
    if (!doc.period_end) patch.period_end = first.data.period_end;
  } else if (first.kind === 'bank_activity') {
    if (doc.document_type === 'statement_package' || doc.document_type === 'other_report') patch.document_type = 'bank_statement';
    if (!doc.period_start) patch.period_start = first.data.period_start;
    if (!doc.period_end) patch.period_end = first.data.period_end;
  }
  if (Object.keys(patch).length > 0) await admin.from('documents').update(patch).eq('id', doc.id);
}

export async function runPendingJobs(options?: { batchSize?: number; deadlineMs?: number }): Promise<WorkerSummary> {
  const admin = createAdminClient();
  const deadline = Date.now() + (options?.deadlineMs ?? 240_000);
  const { data: jobs, error } = await admin.rpc('claim_processing_jobs', { batch_size: options?.batchSize ?? 2 });
  if (error) throw new WorkerError('claim_failed');

  const outcomes: JobOutcome[] = [];
  for (const job of jobs ?? []) {
    if (Date.now() > deadline) {
      // Out of time: hand the job back instead of letting it sit as `running`.
      await setJob(admin, job.id, { status: 'pending', locked_at: null, attempts: Math.max(0, job.attempts - 1) });
      continue;
    }
    outcomes.push(await processJob(admin, job));
  }
  return { claimed: (jobs ?? []).length, processed: outcomes.length, outcomes };
}
