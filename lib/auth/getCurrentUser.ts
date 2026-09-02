// getCurrentUser(): resolve the authenticated user from the session, or null.
// Always use auth.getUser() (validates the JWT) rather than getSession().
import type { User } from '@supabase/supabase-js';

import { createClient } from '@/lib/supabase/server';

export async function getCurrentUser(): Promise<User | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}
