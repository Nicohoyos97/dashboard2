import { expect, test } from '@playwright/test';

import { Fixtures, adminClient, elevateToAal2, insertDenied, supabaseEnv } from './helpers/fixtures';

// RLS for the Phase 5 settings tables (migration 0007): notification
// preferences are private to one user in one business, and an account request
// is raised by its owner, readable by the firm, and withdrawable — but never
// editable — by the client.
test.describe('RLS — notification preferences and account requests', () => {
  test.skip(!supabaseEnv(), 'Supabase env not available');

  const fx = new Fixtures();
  test.afterAll(() => fx.cleanup());

  test('notification preferences are per user and per business, and invisible to anyone else', async () => {
    const a = await fx.makeTenant('np-a');
    const b = await fx.makeTenant('np-b');

    // Positive control: the owner can write and read back their own row.
    const own = await a.client
      .from('notification_preferences')
      .insert({ user_id: a.userId, business_entity_id: a.entityId, reminders: false })
      .select();
    expect(own.error).toBeNull();
    const readOwn = await a.client
      .from('notification_preferences')
      .select('reminders')
      .eq('business_entity_id', a.entityId);
    expect(readOwn.data ?? []).toHaveLength(1);
    expect(readOwn.data?.[0]?.reminders).toBe(false);

    // A row for a business A does not belong to is denied.
    const foreignEntity = await a.client
      .from('notification_preferences')
      .insert({ user_id: a.userId, business_entity_id: b.entityId })
      .select();
    expect(insertDenied(foreignEntity)).toBe(true);

    // A row on someone else's behalf is denied, even in A's own business.
    const foreignUser = await a.client
      .from('notification_preferences')
      .insert({ user_id: b.userId, business_entity_id: a.entityId })
      .select();
    expect(insertDenied(foreignUser)).toBe(true);

    // A co-member of the same business still cannot read another member's row.
    const mate = await fx.makeUser('np-m');
    await fx.addMembership(a.entityId, mate.id, 'client_viewer');
    const mateClient = await fx.signedInClient(mate.email);
    const peek = await mateClient
      .from('notification_preferences')
      .select('user_id')
      .eq('business_entity_id', a.entityId);
    expect(peek.data ?? []).toHaveLength(0);

    // And cannot flip it either — asserted on the row itself, not on the
    // update's return: an invisible row also returns zero rows.
    const flip = await mateClient
      .from('notification_preferences')
      .update({ reminders: true })
      .eq('business_entity_id', a.entityId)
      .select();
    expect(flip.data ?? []).toHaveLength(0);
    const untouched = await adminClient()
      .from('notification_preferences')
      .select('reminders')
      .eq('user_id', a.userId)
      .eq('business_entity_id', a.entityId)
      .maybeSingle();
    expect(untouched.data?.reminders).toBe(false);
  });

  test('a client may raise and withdraw a request but never edit or delete one', async () => {
    const a = await fx.makeTenant('ar-a');
    const b = await fx.makeTenant('ar-b');

    const created = await a.client
      .from('account_requests')
      .insert({
        business_entity_id: a.entityId,
        user_id: a.userId,
        kind: 'data_export',
        message: 'please include 2026',
      })
      .select();
    expect(created.error).toBeNull();
    const requestId = created.data?.[0]?.id as string;
    expect(requestId).toBeTruthy();

    // A second open request of the same kind hits the partial unique index.
    const duplicate = await a.client
      .from('account_requests')
      .insert({ business_entity_id: a.entityId, user_id: a.userId, kind: 'data_export' })
      .select();
    expect(insertDenied(duplicate)).toBe(true);

    // Another tenant sees nothing and cannot raise one against A's business.
    const peek = await b.client.from('account_requests').select('id').eq('id', requestId);
    expect(peek.data ?? []).toHaveLength(0);
    const forge = await b.client
      .from('account_requests')
      .insert({ business_entity_id: a.entityId, user_id: b.userId, kind: 'account_deletion' })
      .select();
    expect(insertDenied(forge)).toBe(true);

    // Rewriting the request instead of withdrawing it is rejected by the guard.
    const rewrite = await a.client
      .from('account_requests')
      .update({ message: 'and delete everything', status: 'cancelled' })
      .eq('id', requestId)
      .select();
    expect(rewrite.data ?? []).toHaveLength(0);

    // Marking one's own request completed is not a client transition.
    const selfComplete = await a.client
      .from('account_requests')
      .update({ status: 'completed' })
      .eq('id', requestId)
      .select();
    expect(selfComplete.data ?? []).toHaveLength(0);

    // Withdrawing it is, and the guard stamps when it happened.
    const withdraw = await a.client
      .from('account_requests')
      .update({ status: 'cancelled' })
      .eq('id', requestId)
      .select('resolved_at');
    expect(withdraw.error).toBeNull();
    expect(withdraw.data ?? []).toHaveLength(1);
    expect(withdraw.data?.[0]?.resolved_at).not.toBeNull();

    // No client delete path at all: a request is history the firm may need.
    const removed = await a.client.from('account_requests').delete().eq('id', requestId).select();
    expect(removed.data ?? []).toHaveLength(0);
    const stillThere = await adminClient()
      .from('account_requests')
      .select('status, message')
      .eq('id', requestId)
      .maybeSingle();
    expect(stillThere.data?.status).toBe('cancelled');
    expect(stillThere.data?.message).toBe('please include 2026');
  });

  test('a client cannot raise a request that already carries the firm\'s reply or a chosen timestamp', async () => {
    const a = await fx.makeTenant('ag-a');
    const base = { business_entity_id: a.entityId, user_id: a.userId, kind: 'data_export' as const };

    // Firm-owned columns on INSERT are refused by the guard (0009), whatever RLS allows.
    expect(insertDenied(await a.client.from('account_requests').insert({ ...base, firm_note: 'Approved — proceed' }).select())).toBe(true);
    expect(insertDenied(await a.client.from('account_requests').insert({ ...base, resolved_by: a.userId }).select())).toBe(true);
    expect(insertDenied(await a.client.from('account_requests').insert({ ...base, resolved_at: '2020-01-01T00:00:00Z' }).select())).toBe(true);

    // A client-supplied requested_at is replaced by the server clock.
    const backdated = await a.client
      .from('account_requests')
      .insert({ ...base, requested_at: '2020-01-01T00:00:00Z' })
      .select('requested_at');
    expect(backdated.error).toBeNull();
    expect(new Date(backdated.data?.[0]?.requested_at ?? '').getFullYear()).toBeGreaterThan(2020);
  });

  test('the firm answers a request without rewriting it, and never reopens one', async () => {
    const a = await fx.makeTenant('fr-a');
    const created = await a.client
      .from('account_requests')
      .insert({ business_entity_id: a.entityId, user_id: a.userId, kind: 'account_deletion', message: 'close it after 2026 taxes' })
      .select('id');
    expect(created.error).toBeNull();
    const requestId = created.data?.[0]?.id as string;

    const firm = await fx.makeFirmUser('fr-admin');
    await elevateToAal2(firm.client);

    // The firm's own words go in firm_note; the client's do not change.
    const rewrite = await firm.client
      .from('account_requests')
      .update({ message: 'never mind', status: 'in_progress' })
      .eq('id', requestId)
      .select();
    expect(rewrite.data ?? []).toHaveLength(0);

    const started = await firm.client
      .from('account_requests')
      .update({ status: 'in_progress', firm_note: 'Preparing the export' })
      .eq('id', requestId)
      .select('status, resolved_at');
    expect(started.error).toBeNull();
    // Still open, so nothing is resolved yet.
    expect(started.data?.[0]).toMatchObject({ status: 'in_progress', resolved_at: null });

    // Completing it stamps who and when, without the app having to remember to.
    const done = await firm.client
      .from('account_requests')
      .update({ status: 'completed' })
      .eq('id', requestId)
      .select('resolved_at, resolved_by');
    expect(done.error).toBeNull();
    expect(done.data?.[0]?.resolved_at).not.toBeNull();
    expect(done.data?.[0]?.resolved_by).toBe(firm.userId);

    // A resolved request is the firm's evidence that it answered: not reopened.
    const reopen = await firm.client
      .from('account_requests')
      .update({ status: 'in_progress' })
      .eq('id', requestId)
      .select();
    expect(reopen.data ?? []).toHaveLength(0);

    const stored = await adminClient().from('account_requests').select('status, message').eq('id', requestId).maybeSingle();
    expect(stored.data).toMatchObject({ status: 'completed', message: 'close it after 2026 taxes' });
  });

  test('an insight tick is the ticker\'s own and stays inside their business', async () => {
    const a = await fx.makeTenant('id-a');
    const b = await fx.makeTenant('id-b');
    const row = { rule_key: 'margin_changed', period_start: '2026-07-01', period_end: '2026-07-31' };

    const own = await a.client.from('insight_dismissals').insert({ ...row, user_id: a.userId, business_entity_id: a.entityId }).select();
    expect(own.error).toBeNull();

    // Not for a business A does not belong to, and not on someone else's behalf.
    expect(insertDenied(await a.client.from('insight_dismissals').insert({ ...row, user_id: a.userId, business_entity_id: b.entityId }).select())).toBe(true);
    expect(insertDenied(await a.client.from('insight_dismissals').insert({ ...row, user_id: b.userId, business_entity_id: a.entityId }).select())).toBe(true);

    // A co-member's ticks never hide a line from another member.
    const mate = await fx.makeUser('id-m');
    await fx.addMembership(a.entityId, mate.id, 'client_viewer');
    const mateClient = await fx.signedInClient(mate.email);
    expect((await mateClient.from('insight_dismissals').select('rule_key').eq('business_entity_id', a.entityId)).data ?? []).toHaveLength(0);

    // Un-ticking is a delete of your own row; B cannot remove A's.
    expect((await b.client.from('insight_dismissals').delete().eq('business_entity_id', a.entityId).select()).data ?? []).toHaveLength(0);
    expect((await a.client.from('insight_dismissals').delete().eq('business_entity_id', a.entityId).select()).data ?? []).toHaveLength(1);
  });
});
