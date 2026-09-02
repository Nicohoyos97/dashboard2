// Service-role Supabase client. BYPASSES RLS — use ONLY for explicit system
// writes that have no client-facing policy (audit log, server-maintained
// counters, report cache). NEVER use it to read or write tenant data that
// should go through RLS; that defeats multi-tenant isolation. See docs/SECURITY.md.
import { createClient } from '@supabase/supabase-js';
import 'server-only';

import type { Database } from './types';

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
