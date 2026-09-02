// Grant a user the master_admin role of the firm (creates the firm on first
// run). This is the only way to create the first firm admin — the app never
// self-provisions firm roles. Runs with the service role from .env.local (or
// the environment), locally or against the cloud project.
//
//   pnpm firm:admin -- <email> [--password <pw>] [--firm "Hoyos Baker"]
//
// If the user does not exist yet, pass --password to create it (confirmed);
// otherwise sign up first (Google or email) and re-run.
import { readFileSync } from 'node:fs';

import { createClient } from '@supabase/supabase-js';

import type { Database } from '../lib/supabase/types';

function loadEnvLocal(): void {
  try {
    for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (match && match[1] && !process.env[match[1]]) process.env[match[1]] = match[2] ?? '';
    }
  } catch {
    // .env.local is optional when the variables come from the environment.
  }
}

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const email = process.argv[2]?.toLowerCase();
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing');
  if (!email || email.startsWith('--')) throw new Error('usage: pnpm firm:admin -- <email> [--password <pw>] [--firm <name>]');

  const admin = createClient<Database>(url, key, { auth: { persistSession: false } });

  let { data: profile } = await admin
    .from('profiles')
    .select('id, email')
    .eq('email', email)
    .maybeSingle();

  if (!profile) {
    const password = arg('--password');
    if (!password) throw new Error(`No account for ${email}. Sign up first, or pass --password to create it.`);
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error || !data.user) throw new Error(`createUser: ${error?.message}`);
    profile = { id: data.user.id, email };
    console.log(`Created user ${email}`);
  }

  let { data: firm } = await admin.from('firms').select('id, name').limit(1).maybeSingle();
  if (!firm) {
    const { data, error } = await admin
      .from('firms')
      .insert({ name: arg('--firm') ?? 'Hoyos Baker' })
      .select('id, name')
      .single();
    if (error || !data) throw new Error(`insert firm: ${error?.message}`);
    firm = data;
    console.log(`Created firm "${firm.name}"`);
  }

  const { error } = await admin
    .from('firm_memberships')
    .upsert({ firm_id: firm.id, user_id: profile.id, role: 'master_admin' });
  if (error) throw new Error(`upsert firm_membership: ${error.message}`);

  console.log(`${email} is master_admin of "${firm.name}".`);
  console.log('Next: sign in, open /admin, and enroll an authenticator app (TOTP).');
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
