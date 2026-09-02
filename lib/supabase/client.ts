// Supabase browser client (anon key). Use in Client Components only.
import { createBrowserClient } from '@supabase/ssr';

import { COOKIE_OPTIONS, supabaseEnv } from './env';
import type { Database } from './types';

export function createClient() {
  const { url, anonKey } = supabaseEnv();
  return createBrowserClient<Database>(url, anonKey, { cookieOptions: COOKIE_OPTIONS });
}
