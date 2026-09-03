// Fixed-window rate limiting on Postgres (docs/PLAN.md §3.8). The counter table
// has no client policies and consume_rate_limit() is executable by the service
// role only, so the key space cannot be poisoned through PostgREST. Keys are
// composed here, server-side. On a database error we fail open and log the
// error code: an outage must not lock every user out of sign-in.
import { headers } from 'next/headers';
import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';

export type RateLimitRule = { max: number; windowSeconds: number };

export const RATE_LIMITS = {
  signIn: { max: 10, windowSeconds: 15 * 60 },
  signUp: { max: 5, windowSeconds: 60 * 60 },
  passwordReset: { max: 5, windowSeconds: 60 * 60 },
  upload: { max: 60, windowSeconds: 60 * 60 },
  download: { max: 120, windowSeconds: 60 * 60 },
  chat: { max: 30, windowSeconds: 10 * 60 },
} as const satisfies Record<string, RateLimitRule>;

export async function consumeRateLimit(key: string, rule: RateLimitRule): Promise<boolean> {
  const { data, error } = await createAdminClient().rpc('consume_rate_limit', {
    p_key: key,
    p_max: rule.max,
    p_window: `${rule.windowSeconds} seconds`,
  });
  if (error) {
    console.error('[rate-limit] rpc failed:', error.code);
    return true;
  }
  return data === true;
}

// x-forwarded-for is spoofable; for rate limiting it is still the best
// available signal and only ever throttles, never authorizes.
export async function requestIp(): Promise<string> {
  const h = await headers();
  return h.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}
