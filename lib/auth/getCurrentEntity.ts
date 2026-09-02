// Resolve the caller's "current" business entity server-side.
//
// Membership is many-to-many (a user can belong to N businesses). Until the
// entity switcher ships (INITIAL_PROMPT.md §7), "current" = the earliest-joined
// membership. There is no self-serve create path: businesses are provisioned by
// the firm, so a user with no membership gets null and the UI shows a pending
// state — never a placeholder workspace.
import { createClient } from '@/lib/supabase/server';

import { getCurrentUser } from './getCurrentUser';

export type CurrentEntity = { id: string; name: string; role: string };

export async function getCurrentEntity(): Promise<CurrentEntity | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  const supabase = await createClient();

  const { data: membership } = await supabase
    .from('entity_memberships')
    .select('business_entity_id, role')
    .eq('user_id', user.id)
    .order('joined_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!membership) return null;

  const { data: entity } = await supabase
    .from('business_entities')
    .select('id, name')
    .eq('id', membership.business_entity_id)
    .maybeSingle();
  if (!entity) return null;

  return { id: entity.id, name: entity.name, role: membership.role };
}
