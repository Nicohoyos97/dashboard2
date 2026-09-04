// Daily deadline notifier (INITIAL_PROMPT.md §7). Vercel Cron calls it once a
// day with `Authorization: Bearer $CRON_SECRET`; each business is evaluated in
// its own time zone, so one UTC run serves every calendar. Not localized, never
// cached.
import { NextResponse } from 'next/server';

import { cronAuthorized } from '@/lib/jobs/cron-auth';
import { runDeadlineNotifications } from '@/lib/notifications/deadline-job';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function GET(request: Request) {
  if (!cronAuthorized(request)) return new NextResponse(null, { status: 401 });
  const summary = await runDeadlineNotifications();
  return NextResponse.json(summary, { headers: { 'Cache-Control': 'no-store' } });
}
