'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { logAccess } from '@/lib/audit/logAccess';
import { getCurrentEntity } from '@/lib/auth/getCurrentEntity';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { createClient } from '@/lib/supabase/server';

const deleteSchema = z.object({ sessionId: z.string().uuid() });

export type DeleteSessionResult =
  | { ok: true }
  | { ok: false; error: 'invalid' | 'unauthorized' | 'not_found' };

// Deletes one of the caller's own conversations (migration 0006). The delete
// runs through RLS as the user, so a session that belongs to someone else, or
// to another business, simply matches zero rows. Messages and citations
// cascade in the database.
export async function deleteChatSession(raw: unknown): Promise<DeleteSessionResult> {
  const parsed = deleteSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: 'invalid' };
  const [user, entity] = await Promise.all([getCurrentUser(), getCurrentEntity()]);
  if (!user || !entity) return { ok: false, error: 'unauthorized' };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('chat_sessions')
    .delete()
    .eq('id', parsed.data.sessionId)
    .eq('business_entity_id', entity.id)
    .eq('user_id', user.id)
    .select('id');
  if (error || !data || data.length === 0) return { ok: false, error: 'not_found' };

  await logAccess({
    action: 'chat.session.deleted',
    resourceType: 'chat_session',
    resourceId: parsed.data.sessionId,
    businessEntityId: entity.id,
  });
  revalidatePath('/chat');
  return { ok: true };
}
