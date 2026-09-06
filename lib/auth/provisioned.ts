// The front door's second lock.
//
// Sign-ups are closed in the Auth server (supabase/config.toml, and the same
// switch in the cloud project), but that is one project setting away from being
// wrong, and Google is the path that would quietly create an account if it
// were: a stranger lands on /callback with a valid session and no relationship
// to the firm. An account exists because the firm provisioned one, and the firm
// writes the membership in the same breath as the invitation
// (lib/firm/onboarding.ts), so a user created seconds ago with no membership of
// any kind was never provisioned.
//
// Only brand-new accounts are judged. Anything older is left alone: a client
// between businesses keeps the pending Overview they are meant to see, and a
// password reset never turns into a lockout.
import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/lib/supabase/types';

const JUST_CREATED_MS = 2 * 60 * 1000;

export async function isUnprovisioned(
  supabase: SupabaseClient<Database>,
  user: { id: string; created_at: string } | null,
): Promise<boolean> {
  if (!user) return false;
  const createdAt = Date.parse(user.created_at);
  if (!Number.isFinite(createdAt) || Date.now() - createdAt > JUST_CREATED_MS) return false;

  // Read under the caller's own session, which is the same thing the portal
  // will do a moment later: if RLS shows them no membership, they have none.
  const [client, firm] = await Promise.all([
    supabase.from('entity_memberships').select('user_id').eq('user_id', user.id).limit(1),
    supabase.from('firm_memberships').select('user_id').eq('user_id', user.id).limit(1),
  ]);
  return !client.data?.length && !firm.data?.length;
}
