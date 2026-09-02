'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { z } from 'zod';

import { ENTITY_COOKIE, listEntities } from '@/lib/auth/getCurrentEntity';

const switchSchema = z.object({ entityId: z.string().uuid() });

export type SwitchEntityResult = { ok: true } | { ok: false };

// Entity switcher (INITIAL_PROMPT.md §7). The cookie is only a preference: it
// is honored by getCurrentEntity() solely when the session still has a
// membership for that business, and it is validated here before being set.
export async function switchEntity(input: unknown): Promise<SwitchEntityResult> {
  const parsed = switchSchema.safeParse(input);
  if (!parsed.success) return { ok: false };

  const entities = await listEntities();
  if (!entities.some((e) => e.id === parsed.data.entityId)) return { ok: false };

  const cookieStore = await cookies();
  cookieStore.set(ENTITY_COOKIE, parsed.data.entityId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  });

  revalidatePath('/', 'layout');
  return { ok: true };
}
