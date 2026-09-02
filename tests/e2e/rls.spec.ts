import { expect, test } from '@playwright/test';
import { type SupabaseClient, createClient } from '@supabase/supabase-js';

import type { Database } from '../../lib/supabase/types';

// Cross-tenant isolation — the most important test in the repo. Two real users
// in two businesses; user A must not be able to read or mutate business B's data
// through any verb. Businesses are firm-provisioned (no self-serve RPC), so
// fixtures are created through the service role — exactly how the admin portal
// will do it. Runs against local Supabase (env loaded by playwright.config.ts).
//
// Phase 1 extends this file with: firm_memberships / is_firm_admin(), the private
// documents bucket + signed URLs, every §5 ingestion table, and the aal2 gate.
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PASSWORD = 'Str0ng!Pass1';

type Tenant = { userId: string; entityId: string; client: SupabaseClient<Database> };

test.describe('RLS cross-tenant isolation', () => {
  test.skip(!URL || !ANON || !SERVICE, 'Supabase env not available');

  const admin = createClient<Database>(URL!, SERVICE!, { auth: { persistSession: false } });
  const created: string[] = [];

  test.afterAll(async () => {
    for (const id of created) await admin.auth.admin.deleteUser(id);
  });

  async function makeUser(label: string): Promise<{ id: string; email: string }> {
    const email = `rls-${label}-${Date.now()}@example.com`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
    });
    if (error || !data.user) throw new Error(`createUser: ${error?.message}`);
    created.push(data.user.id);
    return { id: data.user.id, email };
  }

  async function signedInClient(email: string): Promise<SupabaseClient<Database>> {
    const client = createClient<Database>(URL!, ANON!, { auth: { persistSession: false } });
    const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
    if (error) throw new Error(`signIn: ${error.message}`);
    return client;
  }

  // A user + a business they own, provisioned the way the firm admin portal will.
  async function makeTenant(label: string): Promise<Tenant> {
    const user = await makeUser(label);
    const { data: entity, error: entErr } = await admin
      .from('business_entities')
      .insert({ name: `${label} Business` })
      .select('id')
      .single();
    if (entErr || !entity) throw new Error(`insert entity: ${entErr?.message}`);
    const { error: memErr } = await admin
      .from('entity_memberships')
      .insert({ business_entity_id: entity.id, user_id: user.id, role: 'client_owner' });
    if (memErr) throw new Error(`insert membership: ${memErr.message}`);
    return { userId: user.id, entityId: entity.id, client: await signedInClient(user.email) };
  }

  // Insert is denied either by an explicit error or by 0 rows affected
  // (RLS-blocked inserts may surface as data:[] in some client versions).
  const insertDenied = (r: { error: unknown; data: unknown[] | null }) =>
    r.error !== null || (r.data ?? []).length === 0;

  test('user A cannot read or mutate business B via any verb', async () => {
    const a = await makeTenant('a');
    const b = await makeTenant('b');

    // Sanity: A can see its own business (policies aren't simply denying everything).
    const own = await a.client.from('business_entities').select('id').eq('id', a.entityId);
    expect(own.data ?? []).toHaveLength(1);

    // 1. SELECT B's business → 0 rows.
    const sel = await a.client.from('business_entities').select('id').eq('id', b.entityId);
    expect(sel.data ?? []).toHaveLength(0);

    // 2. SELECT B's memberships → 0 rows.
    const selMembers = await a.client
      .from('entity_memberships')
      .select('user_id')
      .eq('business_entity_id', b.entityId);
    expect(selMembers.data ?? []).toHaveLength(0);

    // 3. UPDATE B's business (rename) → 0 rows affected.
    const upd = await a.client
      .from('business_entities')
      .update({ name: 'hacked' })
      .eq('id', b.entityId)
      .select();
    expect(upd.data ?? []).toHaveLength(0);

    // 4. DELETE B's business → 0 rows (no client DELETE policy exists at all — A
    //    cannot delete its OWN business either; the firm retires businesses).
    const del = await a.client.from('business_entities').delete().eq('id', b.entityId).select();
    expect(del.data ?? []).toHaveLength(0);
    const delOwn = await a.client.from('business_entities').delete().eq('id', a.entityId).select();
    expect(delOwn.data ?? []).toHaveLength(0);

    // 5. INSERT self into B's business → denied (no INSERT policy on memberships).
    const ins = await a.client
      .from('entity_memberships')
      .insert({ business_entity_id: b.entityId, user_id: a.userId, role: 'client_viewer' })
      .select();
    expect(insertDenied(ins)).toBe(true);

    // 6. INSERT a new business as a client → denied (firm-provisioned only).
    const insEntity = await a.client.from('business_entities').insert({ name: 'rogue' }).select();
    expect(insertDenied(insEntity)).toBe(true);

    // B's business is untouched (read back as B).
    const bRow = await b.client
      .from('business_entities')
      .select('name')
      .eq('id', b.entityId)
      .maybeSingle();
    expect(bRow.data?.name).toBe('b Business');
  });

  test('client_viewer can read but not edit the business profile', async () => {
    const owner = await makeTenant('vo');
    const viewer = await makeUser('vv');
    await admin
      .from('entity_memberships')
      .insert({ business_entity_id: owner.entityId, user_id: viewer.id, role: 'client_viewer' });
    const viewerClient = await signedInClient(viewer.email);

    const read = await viewerClient
      .from('business_entities')
      .select('name')
      .eq('id', owner.entityId);
    expect(read.data ?? []).toHaveLength(1);

    const upd = await viewerClient
      .from('business_entities')
      .update({ name: 'viewer-edit' })
      .eq('id', owner.entityId)
      .select();
    expect(upd.data ?? []).toHaveLength(0);

    const ownerUpd = await owner.client
      .from('business_entities')
      .update({ name: 'owner-edit' })
      .eq('id', owner.entityId)
      .select('name');
    expect(ownerUpd.data?.[0]?.name).toBe('owner-edit');
  });

  test('chat isolation; audit_logs have no client read path', async () => {
    const a = await makeTenant('ca');
    const b = await makeTenant('cb');

    // A viewer of business B (membership inserted via the service role).
    const viewer = await makeUser('cm');
    await admin
      .from('entity_memberships')
      .insert({ business_entity_id: b.entityId, user_id: viewer.id, role: 'client_viewer' });
    const viewerClient = await signedInClient(viewer.email);

    // Seed business B: B starts a session; the service role writes a message and
    // an audit row for business B.
    const sessIns = await b.client
      .from('chat_sessions')
      .insert({ business_entity_id: b.entityId, user_id: b.userId, title: 'B thread' })
      .select()
      .single();
    expect(sessIns.error).toBeNull();
    const sessionId = sessIns.data!.id;

    await admin.from('chat_messages').insert({
      session_id: sessionId,
      business_entity_id: b.entityId,
      role: 'user',
      content: { text: 'hello' },
    });
    await admin
      .from('audit_logs')
      .insert({ business_entity_id: b.entityId, action: 'test.event', actor_id: b.userId });

    // 1. A (other business) SELECT B's sessions → 0 rows.
    const selSess = await a.client
      .from('chat_sessions')
      .select('id')
      .eq('business_entity_id', b.entityId);
    expect(selSess.data ?? []).toHaveLength(0);

    // 2. A SELECT B's messages → 0 rows.
    const selMsg = await a.client
      .from('chat_messages')
      .select('id')
      .eq('business_entity_id', b.entityId);
    expect(selMsg.data ?? []).toHaveLength(0);

    // 3. A INSERT a session into B's business → denied (not a member).
    const insSess = await a.client
      .from('chat_sessions')
      .insert({ business_entity_id: b.entityId, user_id: a.userId, title: 'evil' })
      .select();
    expect(insertDenied(insSess)).toBe(true);

    // 4. A INSERT a message into B's business → denied (no client write policy).
    const insMsg = await a.client
      .from('chat_messages')
      .insert({ session_id: sessionId, business_entity_id: b.entityId, role: 'user', content: {} })
      .select();
    expect(insertDenied(insMsg)).toBe(true);

    // 5. audit_logs: NO client read path — not the viewer, not even B's owner.
    //    Firm-admin read arrives with is_firm_admin() in Phase 1.
    const viewerAudit = await viewerClient
      .from('audit_logs')
      .select('id')
      .eq('business_entity_id', b.entityId);
    expect(viewerAudit.data ?? []).toHaveLength(0);
    const ownerAudit = await b.client
      .from('audit_logs')
      .select('id')
      .eq('business_entity_id', b.entityId);
    expect(ownerAudit.data ?? []).toHaveLength(0);

    // 6. ...but the viewer CAN read B's sessions (member read) — proves the audit
    //    denial is specific, not a blanket block.
    const viewerSess = await viewerClient
      .from('chat_sessions')
      .select('id')
      .eq('business_entity_id', b.entityId);
    expect(viewerSess.data ?? []).toHaveLength(1);

    // 7. Positive control: the service role reads the audit row it wrote.
    const adminAudit = await admin
      .from('audit_logs')
      .select('id')
      .eq('business_entity_id', b.entityId);
    expect(adminAudit.data ?? []).toHaveLength(1);
  });

  test('avatars storage: writes are owner-folder-only, read is public', async () => {
    const a = await makeTenant('sa');
    const b = await makeTenant('sb');

    // Tiny valid 1x1 PNG (matches the bucket's allowed_mime_types).
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64',
    );
    const opts = { contentType: 'image/png', upsert: true };

    // 1. A uploads into ITS OWN folder (avatars/<a.userId>/…) → ok.
    const own = await a.client.storage.from('avatars').upload(`${a.userId}/x.png`, png, opts);
    expect(own.error).toBeNull();

    // 2. A uploads into B's folder → denied by the owner-only write policy.
    const cross = await a.client.storage.from('avatars').upload(`${b.userId}/evil.png`, png, opts);
    expect(cross.error).not.toBeNull();

    // 3. A cannot overwrite an object in B's folder either.
    const bOwn = await b.client.storage.from('avatars').upload(`${b.userId}/y.png`, png, opts);
    expect(bOwn.error).toBeNull();
    const crossUpdate = await a.client.storage
      .from('avatars')
      .upload(`${b.userId}/y.png`, png, opts);
    expect(crossUpdate.error).not.toBeNull();

    // 4. Read is PUBLIC — A's avatar resolves via its public URL.
    const { data: pub } = a.client.storage.from('avatars').getPublicUrl(`${a.userId}/x.png`);
    const res = await fetch(pub.publicUrl);
    expect(res.ok).toBe(true);
  });

  // profiles_comember_select: members of a shared business can read each other's
  // profile; users in unrelated businesses cannot. Both directions matter — the
  // second is the cross-tenant leak guard.
  test('profiles: co-members see each other; users in other businesses cannot', async () => {
    const a = await makeTenant('pa'); // owns business A — unrelated to B
    const b = await makeTenant('pb'); // owns business B
    const c = await makeTenant('pc'); // owns business C; also a viewer of B

    const { error: memErr } = await admin
      .from('entity_memberships')
      .insert({ business_entity_id: b.entityId, user_id: c.userId, role: 'client_viewer' });
    expect(memErr).toBeNull();

    // Feature: a co-member (C) CAN read B's profile (name + email).
    const seen = await c.client
      .from('profiles')
      .select('id, email, full_name')
      .eq('id', b.userId)
      .maybeSingle();
    expect(seen.error).toBeNull();
    expect(seen.data?.id).toBe(b.userId);

    // Security: a user in an unrelated business (A) CANNOT read B's profile.
    const leaked = await a.client.from('profiles').select('id').eq('id', b.userId).maybeSingle();
    expect(leaked.data).toBeNull();
  });

  // EXECUTE on the RLS helper functions is revoked from `anon`. An UNAUTHENTICATED
  // client hitting an RLS-protected table evaluates a policy whose helper it cannot
  // run, so it must get NO rows — either an empty result or a controlled 403 (42501
  // "permission denied for function"), never leaked rows and never an unhandled
  // 500. Seed real data first so "0 rows" means "blocked", not "empty table".
  test('anonymous client cannot read tenant tables (function hardening)', async () => {
    const seeded = await makeTenant('anon-seed');

    const anon = createClient<Database>(URL!, ANON!, { auth: { persistSession: false } });

    const assertNoLeak = (r: { data: unknown[] | null; error: { code?: string } | null }) => {
      expect(r.data ?? []).toHaveLength(0);
      if (r.error) expect(r.error.code).toBe('42501');
    };

    // business_entities → entities_member_select calls is_entity_member()
    assertNoLeak(await anon.from('business_entities').select('id').eq('id', seeded.entityId));

    // entity_memberships → memberships_member_select calls is_entity_member()
    assertNoLeak(
      await anon
        .from('entity_memberships')
        .select('user_id')
        .eq('business_entity_id', seeded.entityId),
    );

    // profiles → profiles_comember_select calls shares_entity_with()
    assertNoLeak(await anon.from('profiles').select('id').eq('id', seeded.userId));
  });
});
