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
  | 'document.unpublished'
  | 'reminder.due'
  | 'tax.deadline';

// Which preference switch governs each kind. Every publication rides
// "new reports" (on by default) — including a republished statement, because a
// correction to figures the client already acted on must not be hidden behind
// an off-by-default switch; the bell words it as "updated" from the payload.
// `document_activity` carries the other direction: a report the client could
// see was withdrawn.
const CHANNEL: Record<NotificationKind, NotificationChannel> = {
  'document.published': 'new_reports',
  'document.unpublished': 'document_activity',
  'reminder.due': 'reminders',
  'tax.deadline': 'tax_deadlines',
};

export async function notifyEntityMembers(input: {
  entityId: string;
  kind: NotificationKind;
  title: string;
  linkPath: string;
  body?: string;
  /**
   * Facts the bell renders through next-intl in the reader's own locale — a due
   * date, a tax type. Never a sentence: a row written by a job would otherwise
   * be frozen in whatever language the job ran in.
   */
  payload?: Record<string, string | number>;
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

  // supabase-js resolves with `{ error }` rather than throwing, so an unchecked
  // insert reports success on a write that never happened. The deadline job
  // releases its dispatch claim on a throw — silence here would mark the
  // milestone sent forever while nobody was told.
  const { error: insertError } = await admin.from('notifications').insert(
    recipients.map((member) => ({
      user_id: member.user_id,
      business_entity_id: input.entityId,
      kind: input.kind,
      title: input.title,
      body: input.body ?? null,
      link_path: input.linkPath,
      payload: input.payload ?? null,
    })),
  );
  if (insertError) throw new Error('notifications_insert_failed');
}
