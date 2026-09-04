'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { createClient } from '@/lib/supabase/server';

import { MAX_NOTIFICATIONS } from './notifications';

// Marking notifications read: the one client-callable mutation on the table.
// The user id comes from the verified session and RLS (`notifications_self_update`)
// scopes the write to their own rows whatever ids the browser sends.
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
