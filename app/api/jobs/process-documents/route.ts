// Document-processing worker entry (docs/PLAN.md §3.4). Vercel Cron calls it
// every minute with `Authorization: Bearer $CRON_SECRET`; the worker claims a
// few pending jobs and processes them with the service role, naming the
// business each job belongs to. Not localized, never cached.
import { NextResponse } from 'next/server';

import { cronAuthorized } from '@/lib/jobs/cron-auth';
import { runPendingJobs } from '@/lib/ingestion/worker';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(request: Request) {
  if (!cronAuthorized(request)) return new NextResponse(null, { status: 401 });
  const summary = await runPendingJobs({ batchSize: 3, deadlineMs: 240_000 });
  return NextResponse.json(summary, { headers: { 'Cache-Control': 'no-store' } });
}
