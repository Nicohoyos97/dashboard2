// getCurrentUser(): resolve the authenticated user from the session, or null.
// Always use auth.getUser() (validates the JWT) rather than getSession().
//
// Memoized per request, like listEntities(): auth.getUser() is a round trip to
// the Auth server, not a cookie read, and the layout, the page and logAccess
// each ask for the user independently — measured at two validations for one
// Overview render before this.
import type { User } from '@supabase/supabase-js';
import { cache } from 'react';

import { createClient } from '@/lib/supabase/server';

export const getCurrentUser = cache(async (): Promise<User | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});
