import 'server-only';

import { timingSafeEqual } from 'node:crypto';

// Shared gate for the Vercel Cron endpoints: the platform sends
// `Authorization: Bearer $CRON_SECRET`. Fail closed — with no secret configured
// the job is unreachable rather than public, and the comparison is constant
// time so the header cannot be probed a byte at a time.
export function cronAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get('authorization') ?? '';
  if (!secret || !header.startsWith('Bearer ')) return false;
  const provided = Buffer.from(header.slice('Bearer '.length));
  const expected = Buffer.from(secret);
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}
