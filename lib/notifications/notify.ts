// In-app notifications (INITIAL_PROMPT.md §8 "notify client"). notifications
// has no client INSERT policy, so this is a system write through the service
// role that names its tenant; the rows are read by their owner only.
//
// Delivery respects each member's own preferences (§7 Settings): a member who
// turned a channel off is skipped rather than notified and then filtered in the
// UI. A member who has never opened Settings has no preferences row, so the
// defaults in lib/settings/types.ts apply.
import 'server-only';

import { DEFAULT_NOTIFICATION_PREFERENCES, type NotificationChannel } from '@/lib/settings/types';
import { createAdminClient } from '@/lib/supabase/admin';

export type NotificationKind =
  | 'document.published'
  | 'document.replaced'
  | 'reminder.due'
  | 'tax.deadline';

// Which preference switch governs each kind. Publishing is what the client is
// waiting for, so it rides the "new reports" channel (on by default);
// `document_activity` is the noisier churn of uploads and replaced versions.
const CHANNEL: Record<NotificationKind, NotificationChannel> = {
  'document.published': 'new_reports',
  'document.replaced': 'document_activity',
  'reminder.due': 'reminders',
  'tax.deadline': 'tax_deadlines',
};

export async function notifyEntityMembers(input: {
  entityId: string;
  kind: NotificationKind;
  title: string;
  linkPath: string;
  body?: string;
}): Promise<void> {
  const admin = createAdminClient();
  const { data: members } = await admin
    .from('entity_memberships')
    .select('user_id')
    .eq('business_entity_id', input.entityId);
  if (!members?.length) return;

  const channel = CHANNEL[input.kind];
  const { data: preferences, error } = await admin
    .from('notification_preferences')
    .select('user_id, reminders, new_reports, tax_deadlines, document_activity, email_digest')
    .eq('business_entity_id', input.entityId)
    .in(
      'user_id',
      members.map((member) => member.user_id),
    );
  // Silently defaulting here would notify a member who explicitly opted out.
  if (error) throw new Error('notification_preferences_read_failed');
  const wants = new Map<string, boolean>((preferences ?? []).map((row) => [row.user_id, row[channel]]));

  const recipients = members.filter(
    (member) => wants.get(member.user_id) ?? DEFAULT_NOTIFICATION_PREFERENCES[channel],
  );
  if (recipients.length === 0) return;

  await admin.from('notifications').insert(
    recipients.map((member) => ({
      user_id: member.user_id,
      business_entity_id: input.entityId,
      kind: input.kind,
      title: input.title,
      body: input.body ?? null,
      link_path: input.linkPath,
    })),
  );
}
