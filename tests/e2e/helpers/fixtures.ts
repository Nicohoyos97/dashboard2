// Shared fixtures for the RLS / auth specs. Everything is provisioned the way
// the firm admin portal will do it: users via the auth admin API, firm /
// clients / businesses / memberships via the service role. Signed-in clients
// use the anon key + password so every query runs under RLS.
import { type SupabaseClient, createClient } from '@supabase/supabase-js';

import type { Database } from '../../../lib/supabase/types';
import { totp } from './totp';

export const PASSWORD = 'Str0ng!Pass1';

export type Db = SupabaseClient<Database>;

export function supabaseEnv(): { url: string; anon: string; service: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && anon && service ? { url, anon, service } : null;
}

export function adminClient(): Db {
  const env = supabaseEnv();
  if (!env) throw new Error('Supabase env not available');
  return createClient<Database>(env.url, env.service, { auth: { persistSession: false } });
}

export function anonClient(): Db {
  const env = supabaseEnv();
  if (!env) throw new Error('Supabase env not available');
  return createClient<Database>(env.url, env.anon, { auth: { persistSession: false } });
}

// Tracks created auth users so afterAll can delete them (cascades to
// profiles, memberships, and — through firm_memberships — nothing else).
export class Fixtures {
  readonly admin = adminClient();
  private readonly userIds: string[] = [];
  private firmId: string | null = null;
  private readonly run = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

  // Leaves the instance reusable: under fullyParallel a worker that moves to
  // another file runs afterAll, then may come back to this file with the same
  // cached module — a stale firmId would make the next makeClientRow fail its FK.
  async cleanup(): Promise<void> {
    for (const id of this.userIds) await this.admin.auth.admin.deleteUser(id);
    this.userIds.length = 0;
    if (this.firmId) {
      // Businesses / clients reference the firm with ON DELETE RESTRICT, so
      // remove them first (cascades to every tenant table).
      const { data: clients } = await this.admin
        .from('clients')
        .select('id')
        .eq('firm_id', this.firmId);
      const clientIds = (clients ?? []).map((c) => c.id);
      if (clientIds.length) {
        await this.admin.from('business_entities').delete().in('client_id', clientIds);
        await this.admin.from('clients').delete().in('id', clientIds);
      }
      await this.admin.from('firms').delete().eq('id', this.firmId);
      this.firmId = null;
    }
  }

  // Register a user created outside makeUser (e.g. through the invite flow)
  // so cleanup() deletes it too.
  track(userId: string): void {
    this.userIds.push(userId);
  }

  async makeUser(label: string): Promise<{ id: string; email: string }> {
    const email = `e2e-${label}-${this.run}@example.com`;
    const { data, error } = await this.admin.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
    });
    if (error || !data.user) throw new Error(`createUser: ${error?.message}`);
    this.userIds.push(data.user.id);
    return { id: data.user.id, email };
  }

  async signedInClient(email: string): Promise<Db> {
    const client = anonClient();
    const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
    if (error) throw new Error(`signIn: ${error.message}`);
    return client;
  }

  async firm(): Promise<string> {
    if (this.firmId) return this.firmId;
    const { data, error } = await this.admin
      .from('firms')
      .insert({ name: `Test Firm ${this.run}` })
      .select('id')
      .single();
    if (error || !data) throw new Error(`insert firm: ${error?.message}`);
    this.firmId = data.id;
    return data.id;
  }

  async makeClientRow(label: string): Promise<string> {
    const { data, error } = await this.admin
      .from('clients')
      .insert({ firm_id: await this.firm(), name: `${label} Client` })
      .select('id')
      .single();
    if (error || !data) throw new Error(`insert client: ${error?.message}`);
    return data.id;
  }

  async makeEntity(clientId: string, name: string): Promise<string> {
    const { data, error } = await this.admin
      .from('business_entities')
      .insert({ name, client_id: clientId })
      .select('id')
      .single();
    if (error || !data) throw new Error(`insert entity: ${error?.message}`);
    return data.id;
  }

  async addMembership(
    entityId: string,
    userId: string,
    role: 'client_owner' | 'client_viewer',
  ): Promise<void> {
    const { error } = await this.admin
      .from('entity_memberships')
      .insert({ business_entity_id: entityId, user_id: userId, role });
    if (error) throw new Error(`insert membership: ${error.message}`);
  }

  // A user + a client + a business they own.
  async makeTenant(label: string): Promise<Tenant> {
    const user = await this.makeUser(label);
    const clientId = await this.makeClientRow(label);
    const entityId = await this.makeEntity(clientId, `${label} Business`);
    await this.addMembership(entityId, user.id, 'client_owner');
    return {
      userId: user.id,
      email: user.email,
      clientId,
      entityId,
      client: await this.signedInClient(user.email),
    };
  }

  // A firm user at aal1 (password only). Call elevateToAal2() to complete TOTP.
  async makeFirmUser(
    label: string,
    role: 'master_admin' | 'firm_staff' = 'master_admin',
  ): Promise<FirmUser> {
    const user = await this.makeUser(label);
    const { error } = await this.admin
      .from('firm_memberships')
      .insert({ firm_id: await this.firm(), user_id: user.id, role });
    if (error) throw new Error(`insert firm membership: ${error.message}`);
    return { userId: user.id, email: user.email, client: await this.signedInClient(user.email) };
  }
}

export type Tenant = {
  userId: string;
  email: string;
  clientId: string;
  entityId: string;
  client: Db;
};

export type FirmUser = { userId: string; email: string; client: Db };

// Enroll a TOTP factor and verify a code so the session carries aal = 'aal2'.
export async function elevateToAal2(client: Db): Promise<void> {
  const enroll = await client.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'e2e' });
  if (enroll.error || !enroll.data) throw new Error(`mfa.enroll: ${enroll.error?.message}`);
  const factorId = enroll.data.id;
  const challenge = await client.auth.mfa.challenge({ factorId });
  if (challenge.error || !challenge.data) {
    throw new Error(`mfa.challenge: ${challenge.error?.message}`);
  }
  const verify = await client.auth.mfa.verify({
    factorId,
    challengeId: challenge.data.id,
    code: totp(enroll.data.totp.secret),
  });
  if (verify.error) throw new Error(`mfa.verify: ${verify.error.message}`);
  const aal = await client.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal.data?.currentLevel !== 'aal2') throw new Error('session is not aal2 after verify');
}

// RLS-blocked inserts surface as an error or as 0 rows depending on the client
// version; either means "denied".
export const insertDenied = (r: { error: unknown; data: unknown[] | null }): boolean =>
  r.error !== null || (r.data ?? []).length === 0;
