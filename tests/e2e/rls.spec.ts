import { expect, test } from '@playwright/test';

import { Fixtures, anonClient, insertDenied, supabaseEnv } from './helpers/fixtures';

// Cross-tenant isolation — the most important test in the repo. Two real users
// in two businesses; user A must not be able to read or mutate business B's data
// through any verb. Businesses are firm-provisioned (no self-serve RPC), so
// fixtures are created through the service role — exactly how the admin portal
// will do it. Runs against local Supabase (env loaded by playwright.config.ts).
//
// Firm side, documents / storage, and every §5 ingestion table live in
// rls-firm.spec.ts, rls-documents.spec.ts and rls-financials.spec.ts.
test.describe('RLS cross-tenant isolation', () => {
  test.skip(!supabaseEnv(), 'Supabase env not available');

  const fx = new Fixtures();
  test.afterAll(() => fx.cleanup());

  test('user A cannot read or mutate business B via any verb', async () => {
    const a = await fx.makeTenant('a');
    const b = await fx.makeTenant('b');

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

    // 5. INSERT self into B's business → denied (no client INSERT policy on memberships).
    const ins = await a.client
      .from('entity_memberships')
      .insert({ business_entity_id: b.entityId, user_id: a.userId, role: 'client_viewer' })
      .select();
    expect(insertDenied(ins)).toBe(true);

    // 6. INSERT a new business as a client → denied (firm-provisioned only).
    const insEntity = await a.client
      .from('business_entities')
      .insert({ name: 'rogue', client_id: a.clientId })
      .select();
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
    const owner = await fx.makeTenant('vo');
    const viewer = await fx.makeUser('vv');
    await fx.addMembership(owner.entityId, viewer.id, 'client_viewer');
    const viewerClient = await fx.signedInClient(viewer.email);

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
    const a = await fx.makeTenant('ca');
    const b = await fx.makeTenant('cb');

    // A viewer of business B (membership inserted via the service role).
    const viewer = await fx.makeUser('cm');
    await fx.addMembership(b.entityId, viewer.id, 'client_viewer');
    const viewerClient = await fx.signedInClient(viewer.email);

    // Seed business B: B starts a session; the service role writes a message and
    // an audit row for business B.
    const sessIns = await b.client
      .from('chat_sessions')
      .insert({ business_entity_id: b.entityId, user_id: b.userId, title: 'B thread' })
      .select()
      .single();
    expect(sessIns.error).toBeNull();
    const sessionId = sessIns.data!.id;

    await fx.admin.from('chat_messages').insert({
      session_id: sessionId,
      business_entity_id: b.entityId,
      role: 'user',
      content: { text: 'hello' },
    });
    await fx.admin
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
    //    The firm reads them via is_firm_member() (rls-firm.spec.ts).
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
    const adminAudit = await fx.admin
      .from('audit_logs')
      .select('id')
      .eq('business_entity_id', b.entityId);
    expect(adminAudit.data ?? []).toHaveLength(1);

    // 8. Deleting a conversation (0006): only the member who started it — not
    //    a co-member, not another business — and the thread cascades with it.
    const viewerDel = await viewerClient.from('chat_sessions').delete().eq('id', sessionId).select('id');
    expect(viewerDel.data ?? []).toHaveLength(0);
    const aDel = await a.client.from('chat_sessions').delete().eq('id', sessionId).select('id');
    expect(aDel.data ?? []).toHaveLength(0);
    const ownerDel = await b.client.from('chat_sessions').delete().eq('id', sessionId).select('id');
    expect(ownerDel.data ?? []).toHaveLength(1);
    const orphanMessages = await fx.admin.from('chat_messages').select('id').eq('session_id', sessionId);
    expect(orphanMessages.data ?? []).toHaveLength(0);
  });

  test('avatars storage: writes are owner-folder-only, read is public', async () => {
    const a = await fx.makeTenant('sa');
    const b = await fx.makeTenant('sb');

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
    const a = await fx.makeTenant('pa'); // owns business A — unrelated to B
    const b = await fx.makeTenant('pb'); // owns business B
    const c = await fx.makeTenant('pc'); // owns business C; also a viewer of B

    await fx.addMembership(b.entityId, c.userId, 'client_viewer');

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
    const seeded = await fx.makeTenant('anon-seed');
    const anon = anonClient();

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

    // firm tables → is_firm_member() (0002)
    assertNoLeak(await anon.from('clients').select('id').eq('id', seeded.clientId));
  });
});
