// @vitest-environment node
import { afterAll, describe, expect, it } from 'vitest';

import { runDeadlineNotifications } from '@/lib/notifications/deadline-job';
import { notifyEntityMembers } from '@/lib/notifications/notify';

import { Fixtures, supabaseEnv } from '../e2e/helpers/fixtures';
import { seedPublishedReminder } from '../e2e/helpers/seed-statements';

// The deadline notifier against local Supabase (INITIAL_PROMPT.md §7): a
// published obligation coming due reaches the members who want it, once, in
// the business's own calendar.
const env = supabaseEnv();
const fx = new Fixtures();

describe.skipIf(!env)('deadline notifications', () => {
  afterAll(() => fx.cleanup());

  const isoIn = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

  async function notificationsFor(userId: string, kind: string) {
    const { data } = await fx.admin
      .from('notifications')
      .select('kind, title, payload')
      .eq('user_id', userId)
      .eq('kind', kind);
    return data ?? [];
  }

  it('notifies once per milestone, respects the opt-out, and ignores what the client cannot see', async () => {
    const entityId = await fx.makeEntity(await fx.makeClientRow('dl'), 'Deadline Co');
    const wants = await fx.makeUser('dl-wants');
    const optedOut = await fx.makeUser('dl-out');
    await fx.addMembership(entityId, wants.id, 'client_owner');
    await fx.addMembership(entityId, optedOut.id, 'client_viewer');
    await fx.admin
      .from('notification_preferences')
      .insert({ user_id: optedOut.id, business_entity_id: entityId, reminders: false });

    await seedPublishedReminder(fx, entityId, isoIn(3));
    // Not published, and settled: neither may produce a notification.
    await fx.admin.from('reminders').insert([
      { business_entity_id: entityId, reminder_type: 'renewal', title: 'Draft renewal', due_date: isoIn(2), status: 'upcoming', source: 'firm_entry' },
      { business_entity_id: entityId, reminder_type: 'loan_payment', title: 'Already paid', due_date: isoIn(1), status: 'paid', source: 'firm_entry', published_at: new Date().toISOString() },
    ]);
    await fx.admin.from('tax_obligations').insert({
      business_entity_id: entityId,
      tax_type: 'income',
      due_date: isoIn(6),
      tax_year: 2026,
      status: 'firm_confirmed',
      source: 'firm_entry',
      published_at: new Date().toISOString(),
    });

    const first = await runDeadlineNotifications();
    expect(first.failed).toBe(0);

    const reminders = await notificationsFor(wants.id, 'reminder.due');
    expect(reminders).toHaveLength(1);
    expect(reminders[0]?.title).toBe('Equipment loan payment');
    expect(reminders[0]?.payload).toMatchObject({ milestone: 'due_in_7' });
    const taxes = await notificationsFor(wants.id, 'tax.deadline');
    expect(taxes).toHaveLength(1);
    expect(taxes[0]?.payload).toMatchObject({ taxType: 'income', taxYear: 2026 });

    // The member who turned reminders off gets neither that row nor a leftover.
    expect(await notificationsFor(optedOut.id, 'reminder.due')).toHaveLength(0);
    expect(await notificationsFor(optedOut.id, 'tax.deadline')).toHaveLength(1);

    // A second run the same day repeats nothing — the dispatch claim holds.
    await runDeadlineNotifications();
    expect(await notificationsFor(wants.id, 'reminder.due')).toHaveLength(1);
    expect(await notificationsFor(wants.id, 'tax.deadline')).toHaveLength(1);
  });

  it('withdrawing a document reaches only the members who asked for document activity', async () => {
    const entityId = await fx.makeEntity(await fx.makeClientRow('da'), 'Activity Co');
    const wants = await fx.makeUser('da-wants');
    const defaulted = await fx.makeUser('da-default');
    await fx.addMembership(entityId, wants.id, 'client_owner');
    await fx.addMembership(entityId, defaulted.id, 'client_viewer');
    await fx.admin
      .from('notification_preferences')
      .insert({ user_id: wants.id, business_entity_id: entityId, document_activity: true });

    await notifyEntityMembers({
      entityId,
      kind: 'document.unpublished',
      title: 'P&L Jan–Jun 2026',
      linkPath: '/reports',
    });

    // document_activity is off by default, so the second member hears nothing —
    // the switch is honoured at write time, not filtered in the UI.
    expect(await notificationsFor(wants.id, 'document.unpublished')).toHaveLength(1);
    expect(await notificationsFor(defaulted.id, 'document.unpublished')).toHaveLength(0);
  });
});
