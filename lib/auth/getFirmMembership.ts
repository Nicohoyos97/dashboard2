// Resolve the caller's firm membership (Hoyos Baker staff), or null for
// clients. Readable at aal1 through firm_memberships_self_select so the /admin
// layout can decide whether to ask for the second factor; every other firm
// read requires aal2 (is_firm_member / is_firm_admin in 0002_firm.sql).
import { createClient } from '@/lib/supabase/server';

import { getCurrentUser } from './getCurrentUser';

export type FirmRole = 'master_admin' | 'firm_staff';
export type FirmMembership = { firmId: string; role: FirmRole };

function isFirmRole(value: string): value is FirmRole {
  return value === 'master_admin' || value === 'firm_staff';
}

export async function getFirmMembership(): Promise<FirmMembership | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from('firm_memberships')
    .select('firm_id, role')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!data || !isFirmRole(data.role)) return null;

  return { firmId: data.firm_id, role: data.role };
}
