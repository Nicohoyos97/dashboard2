// The absolute origin of the request being served, for links that leave the
// app (Supabase invite emails). Preview deploys and localhost each have their
// own host, so it is read from the request rather than configured; APP_URL is
// the fallback for a context with no headers.
import { headers } from 'next/headers';

export { localePrefix } from '@/i18n/preference';

export async function requestOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host');
  const proto = h.get('x-forwarded-proto') ?? 'http';
  return host ? `${proto}://${host}` : (process.env.APP_URL ?? 'http://localhost:3000');
}
