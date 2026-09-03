'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { createClient } from '@/lib/supabase/server';

// In-app notifications (§7). Rows are written server-side by the jobs that
// publish reports and raise reminders; the client only ever reads its own and
// marks them read — `notifications_self_select` / `_self_update` in 0005 are
// the control, and the user id here comes from the verified session.

export type PortalNotification = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  linkPath: string | null;
  readAt: string | null;
  createdAt: string;
};

const MAX_NOTIFICATIONS = 20;

/** Newest first, capped: the bell is a recent-activity list, not an archive. */
export async function loadNotifications(businessEntityId: string | null): Promise<PortalNotification[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  let query = supabase
    .from('notifications')
    .select('id, kind, title, body, link_path, read_at, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(MAX_NOTIFICATIONS);
  // Entity-scoped rows follow the entity switcher; rows with no entity are
  // account-level and always shown.
  if (businessEntityId) query = query.or(`business_entity_id.eq.${businessEntityId},business_entity_id.is.null`);

  const { data, error } = await query;
  if (error) return [];
  return (data ?? []).map((row) => ({
    id: row.id,
    kind: row.kind,
    title: row.title,
    body: row.body,
    linkPath: row.link_path,
    readAt: row.read_at,
    createdAt: row.created_at,
  }));
}

const idsSchema = z.array(z.string().uuid()).min(1).max(MAX_NOTIFICATIONS);

export async function markNotificationsRead(ids: string[]): Promise<{ ok: boolean }> {
  const parsed = idsSchema.safeParse(ids);
  if (!parsed.success) return { ok: false };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false };

  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .in('id', parsed.data)
    .eq('user_id', user.id)
    .is('read_at', null);
  if (error) return { ok: false };

  revalidatePath('/dashboard');
  return { ok: true };
}
