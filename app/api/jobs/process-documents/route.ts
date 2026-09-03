// Document-processing worker entry (docs/PLAN.md §3.4). Vercel Cron calls it
// every minute with `Authorization: Bearer $CRON_SECRET`; the worker claims a
// few pending jobs and processes them with the service role, naming the
// business each job belongs to. Not localized, never cached.
import { timingSafeEqual } from 'node:crypto';

import { NextResponse } from 'next/server';

import { runPendingJobs } from '@/lib/ingestion/worker';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get('authorization') ?? '';
  if (!secret || !header.startsWith('Bearer ')) return false;
  const provided = Buffer.from(header.slice('Bearer '.length));
  const expected = Buffer.from(secret);
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

export async function GET(request: Request) {
  if (!authorized(request)) return new NextResponse(null, { status: 401 });
  const summary = await runPendingJobs({ batchSize: 3, deadlineMs: 240_000 });
  return NextResponse.json(summary, { headers: { 'Cache-Control': 'no-store' } });
}
