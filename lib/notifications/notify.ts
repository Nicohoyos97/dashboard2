// In-app notifications (INITIAL_PROMPT.md §8 "notify client"). notifications
// has no client INSERT policy, so this is a system write through the service
// role that names its tenant; the rows are read by their owner only.
import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';

export type NotificationKind = 'document.published';

export async function notifyEntityMembers(input: {
  entityId: string;
  kind: NotificationKind;
  title: string;
  linkPath: string;
}): Promise<void> {
  const admin = createAdminClient();
  const { data: members } = await admin
    .from('entity_memberships')
    .select('user_id')
    .eq('business_entity_id', input.entityId);
  if (!members?.length) return;
  await admin.from('notifications').insert(
    members.map((m) => ({
      user_id: m.user_id,
      business_entity_id: input.entityId,
      kind: input.kind,
      title: input.title,
      link_path: input.linkPath,
    })),
  );
}
