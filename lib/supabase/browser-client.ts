// The browser client, loaded the first time a component needs it.
//
// supabase-js is ~63 kB gzipped, and the components that use it in the browser
// touch it only on a submit (an avatar, a logo, an upload, a TOTP code) or once
// after mounting (an invitation's tokens, an enrolment). A static import put
// the whole library in their pages' first load; this puts it behind the
// moment it is used.
import type { createClient } from './client';

export async function browserClient(): Promise<ReturnType<typeof createClient>> {
  const { createClient: create } = await import('./client');
  return create();
}
