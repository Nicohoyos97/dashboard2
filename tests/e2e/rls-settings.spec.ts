import { expect, test } from '@playwright/test';

import { Fixtures, adminClient, insertDenied, supabaseEnv } from './helpers/fixtures';

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

    // And cannot flip it either.
    const flip = await mateClient
      .from('notification_preferences')
      .update({ reminders: true })
      .eq('business_entity_id', a.entityId)
      .select();
    expect(flip.data ?? []).toHaveLength(0);
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

    // Withdrawing it is.
    const withdraw = await a.client
      .from('account_requests')
      .update({ status: 'cancelled' })
      .eq('id', requestId)
      .select();
    expect(withdraw.error).toBeNull();
    expect(withdraw.data ?? []).toHaveLength(1);

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
});
