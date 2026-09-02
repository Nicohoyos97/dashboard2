// Authenticator assurance level of the current session, read from the verified
// JWT claims (getClaims validates the token; it never trusts the raw cookie).
// 'aal2' means the user completed TOTP in this session. The DB re-checks the
// same claim inside is_firm_member() / is_firm_admin(), so this is a UX gate,
// not the control.
import { createClient } from '@/lib/supabase/server';

export type AssuranceLevel = 'aal1' | 'aal2';

function toLevel(value: string | undefined): AssuranceLevel | null {
  return value === 'aal1' || value === 'aal2' ? value : null;
}

export async function getAssuranceLevel(): Promise<AssuranceLevel | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  return toLevel(data?.claims.aal);
}
