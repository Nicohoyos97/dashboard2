'use server';

import { getTranslations } from 'next-intl/server';
import { revalidatePath } from 'next/cache';

import { requireFirmAdmin } from '@/lib/auth/requireFirm';
import type { ActionResult } from '@/lib/firm/result';
import { runPendingJobs } from '@/lib/ingestion/worker';

// Dev-only trigger (INITIAL_PROMPT.md §9): runs the same worker the cron
// calls, in-process, so a local upload can be processed without a scheduler.
// Production relies on Vercel Cron; this action refuses to run there.
export async function runJobsNow(): Promise<ActionResult<{ processed: number }>> {
  const t = await getTranslations('Admin');
  await requireFirmAdmin();
  if (process.env.NODE_ENV === 'production') return { ok: false, error: t('errorInvalid') };

  const summary = await runPendingJobs({ batchSize: 3, deadlineMs: 240_000 });
  revalidatePath('/admin/documents');
  return { ok: true, value: { processed: summary.processed } };
}
