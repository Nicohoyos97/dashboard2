// Supabase server client (anon key + session cookies). Use in Server
// Components, Server Actions, and Route Handlers. RLS-scoped to the signed-in
// user — never the service-role key here.
// Memoized per request so every caller shares one client. That also makes the
// client a stable argument, which is what lets cache() work on the loaders that
// take it — keyed on a fresh object each call, they would never hit.
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { cache } from 'react';

import { COOKIE_OPTIONS, supabaseEnv } from './env';
import type { Database } from './types';

export const createClient = cache(async function createClient() {
  const cookieStore = await cookies();
  const { url, anonKey } = supabaseEnv();

  return createServerClient<Database>(url, anonKey, {
    cookieOptions: COOKIE_OPTIONS,
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component, where setting cookies throws.
          // Safe to ignore: the middleware refreshes the session cookie.
        }
      },
    },
  });
});
