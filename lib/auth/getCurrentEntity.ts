// Resolve the caller's "current" business entity server-side.
//
// Membership is many-to-many (a user can belong to N businesses). The current
// one is the entity named by the hb_entity cookie when the user is a member of
// it, otherwise the earliest-joined membership. There is no self-serve create
// path: businesses are provisioned by the firm, so a user with no membership
// gets null and the UI shows a pending state — never a placeholder workspace.
// Archived businesses are excluded.
import { cookies } from 'next/headers';
import { cache } from 'react';

import { createClient } from '@/lib/supabase/server';

import { getCurrentUser } from './getCurrentUser';

export const ENTITY_COOKIE = 'hb_entity';

export type CurrentEntity = { id: string; name: string; role: string };

// Memoized per request: the layout, the page, and logAccess all ask for it.
export const listEntities = cache(async (): Promise<CurrentEntity[]> => {
  const user = await getCurrentUser();
  if (!user) return [];

  const supabase = await createClient();
  const { data } = await supabase
    .from('entity_memberships')
    .select('role, joined_at, business_entities ( id, name, status )')
    .eq('user_id', user.id)
    .order('joined_at', { ascending: true });

  return (data ?? []).flatMap((m) => {
    const entity = m.business_entities;
    if (!entity || entity.status !== 'active') return [];
    return [{ id: entity.id, name: entity.name, role: m.role }];
  });
});

export async function getCurrentEntity(): Promise<CurrentEntity | null> {
  const entities = await listEntities();
  if (entities.length === 0) return null;

  const cookieStore = await cookies();
  const preferred = cookieStore.get(ENTITY_COOKIE)?.value;
  return entities.find((e) => e.id === preferred) ?? entities[0] ?? null;
}
