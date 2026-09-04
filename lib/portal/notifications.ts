// In-app notifications (§7): the read side. Rows are written server-side by
// the jobs that publish reports and raise reminders; a member only ever reads
// their own — `notifications_self_select` in 0005 is the control. This module
// is `server-only`, not `'use server'`: a loader that takes ids as arguments
// must not double as a client-callable action.
import 'server-only';

import { createClient } from '@/lib/supabase/server';

export type PortalNotification = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  /** Facts the bell words in the reader's locale (0014); older rows have none. */
  payload: Record<string, string | number> | null;
  linkPath: string | null;
  readAt: string | null;
  createdAt: string;
};

export const MAX_NOTIFICATIONS = 20;

/** Newest first, capped: the bell is a recent-activity list, not an archive. */
export async function loadNotifications(userId: string, businessEntityId: string | null): Promise<PortalNotification[]> {
  const supabase = await createClient();
  let query = supabase
    .from('notifications')
    .select('id, kind, title, body, payload, link_path, read_at, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(MAX_NOTIFICATIONS);
  // Entity-scoped rows follow the entity switcher; rows with no entity are
  // account-level and always shown. The id comes from getCurrentEntity(), never
  // from the browser.
  if (businessEntityId) query = query.or(`business_entity_id.eq.${businessEntityId},business_entity_id.is.null`);

  const { data, error } = await query;
  if (error) throw new Error('portal_notifications_read_failed');
  return (data ?? []).map((row) => ({
    id: row.id,
    kind: row.kind,
    title: row.title,
    body: row.body,
    payload: isPayload(row.payload) ? row.payload : null,
    linkPath: row.link_path,
    readAt: row.read_at,
    createdAt: row.created_at,
  }));
}

/** The column is free-form jsonb written by our own jobs; accept only flat scalars. */
function isPayload(value: unknown): value is Record<string, string | number> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every((entry) => typeof entry === 'string' || typeof entry === 'number')
  );
}
