import { expect, test } from '@playwright/test';

import { type Db, Fixtures, elevateToAal2, insertDenied, supabaseEnv } from './helpers/fixtures';

// Firm side of the tenancy model (0002_firm.sql). Two facts carry the whole
// design: (1) a firm user is nobody until the session carries aal2 —
// is_firm_member() / is_firm_admin() read `aal` from the JWT, so a password-only
// login gets exactly what a stranger gets; (2) firm_staff is read-only, every
// write policy checks is_firm_admin() (master_admin). Fixtures are provisioned
// through the service role, the way the admin portal will.
type Rows = PromiseLike<{ data: unknown[] | null }>;
const n = async (q: Rows): Promise<number> => ((await q).data ?? []).length;
const zeroRows = async (q: Rows) => expect(await n(q)).toBe(0);
const denied = async (q: PromiseLike<{ error: unknown; data: unknown[] | null }>) =>
  expect(insertDenied(await q)).toBe(true);

test.describe('RLS firm access', () => {
  test.skip(!supabaseEnv(), 'Supabase env not available');

  const fx = new Fixtures();
  test.afterAll(() => fx.cleanup());

  type Ids = { firmId: string; clientIds: string[]; entityIds: string[]; userIds: string[] };

  // Row counts a firm user gets from each firm-path table, so the aal1 / aal2
  // comparison is one snapshot before and after TOTP.
  const firmView = async (db: Db, i: Ids) => ({
    firms: await n(db.from('firms').select('id').eq('id', i.firmId)),
    clients: await n(db.from('clients').select('id').in('id', i.clientIds)),
    entities: await n(db.from('business_entities').select('id').in('id', i.entityIds)),
    memberships: await n(
      db.from('entity_memberships').select('user_id').in('business_entity_id', i.entityIds),
    ),
    profiles: await n(db.from('profiles').select('id').in('id', i.userIds)),
    audit: await n(db.from('audit_logs').select('id').in('business_entity_id', i.entityIds)),
  });
  // What a firm member sees with `t` tenants provisioned and one audit row seeded.
  const firmSees = (t: number) => ({
    firms: 1,
    clients: t,
    entities: t,
    memberships: t,
    profiles: t,
    audit: 1,
  });
  const NOTHING = { firms: 0, clients: 0, entities: 0, memberships: 0, profiles: 0, audit: 0 };

  test('master_admin: aal1 sees only its own membership; aal2 unlocks reads and writes', async () => {
    const a = await fx.makeTenant('fa');
    const b = await fx.makeTenant('fb');
    const admin = await fx.makeFirmUser('fadmin');
    const db = admin.client;
    const firmId = await fx.firm();
    const ids: Ids = {
      firmId,
      clientIds: [a.clientId, b.clientId],
      entityIds: [a.entityId, b.entityId],
      userIds: [a.userId, b.userId],
    };

    // Seed an audit row so "0 rows" below means blocked, not empty.
    await fx.admin
      .from('audit_logs')
      .insert({ business_entity_id: b.entityId, action: 'test.event', actor_id: b.userId });

    // Positive control at aal1: firm_memberships_self_select needs no second
    // factor — the /admin layout reads it to decide whether to ask for TOTP.
    const self = await db.from('firm_memberships').select('role').eq('user_id', admin.userId);
    expect(self.data?.[0]?.role).toBe('master_admin');

    // At aal1 every is_firm_member() / is_firm_admin() policy is false.
    expect(await firmView(db, ids)).toEqual(NOTHING);

    await elevateToAal2(db);

    // Same user, same queries, now across both tenants.
    expect(await firmView(db, ids)).toEqual(firmSees(2));

    // Provision client → business → membership, exactly the portal's flow.
    const client = await db
      .from('clients')
      .insert({ firm_id: firmId, name: 'Provisioned' })
      .select('id')
      .single();
    expect(client.error).toBeNull();
    const entity = await db
      .from('business_entities')
      .insert({ name: 'Provisioned Business', client_id: client.data!.id })
      .select('id')
      .single();
    expect(entity.error).toBeNull();
    const member = await db
      .from('entity_memberships')
      .insert({ business_entity_id: entity.data!.id, user_id: a.userId, role: 'client_viewer' })
      .select('role');
    expect(member.error).toBeNull();
    expect(member.data).toHaveLength(1);

    // Firm-controlled column on B's business: the guard trigger lets a firm admin through.
    const upd = await db
      .from('business_entities')
      .update({ sales_tax_enabled: true })
      .eq('id', b.entityId)
      .select('sales_tax_enabled');
    expect(upd.error).toBeNull();
    expect(upd.data?.[0]?.sales_tax_enabled).toBe(true);

    // entity_firm_notes is firm-internal: insert, then update.
    const noteIns = await db
      .from('entity_firm_notes')
      .insert({ business_entity_id: b.entityId, notes: 'first' })
      .select('notes');
    expect(noteIns.data?.[0]?.notes).toBe('first');
    const noteUpd = await db
      .from('entity_firm_notes')
      .update({ notes: 'second' })
      .eq('business_entity_id', b.entityId)
      .select('notes');
    expect(noteUpd.data?.[0]?.notes).toBe('second');
  });

  test('firm_staff at aal2 reads the firm path but cannot write configuration', async () => {
    const t = await fx.makeTenant('fs');
    const spare = await fx.makeEntity(t.clientId, 'fs Spare');
    const staff = await fx.makeFirmUser('fstaff', 'firm_staff');
    const db = staff.client;
    await elevateToAal2(db);
    const firmId = await fx.firm();
    const e = t.entityId;
    await fx.admin.from('entity_firm_notes').insert({ business_entity_id: e, notes: 'seed' });
    await fx.admin
      .from('audit_logs')
      .insert({ business_entity_id: e, action: 'test.event', actor_id: t.userId });

    // Positive control: is_firm_member() covers staff for every SELECT.
    const ids: Ids = { firmId, clientIds: [t.clientId], entityIds: [e], userIds: [t.userId] };
    expect(await firmView(db, ids)).toEqual(firmSees(1));
    expect(await n(db.from('entity_firm_notes').select('notes').eq('business_entity_id', e))).toBe(
      1,
    );

    // Every *_admin_insert / *_admin_update policy checks is_firm_admin() → master_admin only.
    // The notes insert targets an entity with no note yet so a PK conflict
    // cannot mask the policy check.
    const member = { business_entity_id: e, user_id: staff.userId, role: 'client_viewer' };
    await denied(db.from('clients').insert({ firm_id: firmId, name: 'x' }).select());
    await denied(
      db.from('business_entities').insert({ name: 'x', client_id: t.clientId }).select(),
    );
    await denied(db.from('entity_memberships').insert(member).select());
    await denied(
      db.from('entity_firm_notes').insert({ business_entity_id: spare, notes: 'x' }).select(),
    );
    await zeroRows(db.from('clients').update({ name: 'renamed' }).eq('id', t.clientId).select());
    await zeroRows(
      db.from('business_entities').update({ sales_tax_enabled: true }).eq('id', e).select(),
    );
    await zeroRows(
      db
        .from('entity_memberships')
        .update({ role: 'client_viewer' })
        .eq('business_entity_id', e)
        .select(),
    );
    await zeroRows(
      db.from('entity_firm_notes').update({ notes: 'hacked' }).eq('business_entity_id', e).select(),
    );
  });

  test('client_owner cannot see firm tables; owner update covers profile fields only', async () => {
    const t = await fx.makeTenant('fo');
    const admin = await fx.makeFirmUser('fo-admin');
    const firmId = await fx.firm();
    const db = t.client;
    const e = t.entityId;
    await fx.admin.from('entity_firm_notes').insert({ business_entity_id: e, notes: 'internal' });

    // No client policy exists on firms / clients / entity_firm_notes; the only
    // firm_memberships row a client may read is its own, and it has none.
    await zeroRows(db.from('firms').select('id').eq('id', firmId));
    await zeroRows(db.from('clients').select('id').eq('id', t.clientId));
    await zeroRows(db.from('firm_memberships').select('user_id').eq('user_id', admin.userId));
    await zeroRows(db.from('entity_firm_notes').select('notes').eq('business_entity_id', e));

    // Positive control: entities_owner_update lets the owner edit profile fields.
    const rename = await db
      .from('business_entities')
      .update({ name: 'renamed' })
      .eq('id', e)
      .select('name');
    expect(rename.data?.[0]?.name).toBe('renamed');
  });

  // Row-level policies cannot restrict columns: the guard_entity_firm_columns
  // trigger (SECURITY INVOKER, gated on auth.role()) is what keeps a client_owner
  // from flipping firm-controlled columns. A regression here would let a client
  // enable Sales Taxes or move the business to another client.
  test('guard_entity_firm_columns: client_owner cannot touch firm-controlled columns', async () => {
    const t = await fx.makeTenant('fg');
    const otherClient = await fx.makeClientRow('fg-other');
    const blocked = (r: { error: { code?: string } | null; data: unknown[] | null }): boolean =>
      r.error ? r.error.code === '42501' : (r.data ?? []).length === 0;

    const flip = await t.client
      .from('business_entities')
      .update({ sales_tax_enabled: true })
      .eq('id', t.entityId)
      .select('sales_tax_enabled');
    expect(blocked(flip)).toBe(true);
    const move = await t.client
      .from('business_entities')
      .update({ client_id: otherClient })
      .eq('id', t.entityId)
      .select('client_id');
    expect(blocked(move)).toBe(true);

    // Read back through the service role: nothing changed.
    const after = await fx.admin
      .from('business_entities')
      .select('sales_tax_enabled, client_id')
      .eq('id', t.entityId)
      .single();
    expect(after.data?.sales_tax_enabled).toBe(false);
    expect(after.data?.client_id).toBe(t.clientId);
  });

  test('conversations are private: firm admin at aal2 cannot read chat tables', async () => {
    const t = await fx.makeTenant('fc');
    const admin = await fx.makeFirmUser('fc-admin');
    const db = admin.client;
    const e = t.entityId;
    await elevateToAal2(db);

    const sess = await t.client
      .from('chat_sessions')
      .insert({ business_entity_id: e, user_id: t.userId, title: 'private' })
      .select('id')
      .single();
    expect(sess.error).toBeNull();
    const message = { session_id: sess.data!.id, business_entity_id: e, role: 'user', content: {} };
    await fx.admin.from('chat_messages').insert(message);

    // Positive control: the same admin reads the business itself.
    expect(await n(db.from('business_entities').select('id').eq('id', e))).toBe(1);

    // No firm policy on chat_sessions / chat_messages (usage is read via ai_usage_daily).
    await zeroRows(db.from('chat_sessions').select('id').eq('business_entity_id', e));
    await zeroRows(db.from('chat_messages').select('id').eq('business_entity_id', e));
  });

  test('firm admin cannot delete their own firm membership', async () => {
    const admin = await fx.makeFirmUser('fd-admin');
    const other = await fx.makeFirmUser('fd-staff', 'firm_staff');
    const db = admin.client;
    await elevateToAal2(db);

    // Positive control: the admin removes another member.
    const delOther = await db
      .from('firm_memberships')
      .delete()
      .eq('user_id', other.userId)
      .select();
    expect(delOther.data).toHaveLength(1);

    // firm_memberships_admin_delete requires user_id <> auth.uid(): a firm can
    // never lock itself out by deleting its last admin.
    await zeroRows(db.from('firm_memberships').delete().eq('user_id', admin.userId).select());
    expect(
      await n(fx.admin.from('firm_memberships').select('user_id').eq('user_id', admin.userId)),
    ).toBe(1);
  });
});
