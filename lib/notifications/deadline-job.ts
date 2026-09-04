// The daily deadline notifier (INITIAL_PROMPT.md §7). Walks every active
// business in its own time zone and tells members about reminders and tax
// obligations coming due, once per milestone — the producer the "Reminders and
// due dates" and "Tax deadlines" switches were missing.
//
// Service role: `notifications` has no client INSERT policy and
// `notification_dispatches` has no policies at all, so both are system writes
// that name their tenant. Only published, unsettled rows are considered — the
// client is never told about something they cannot see in the portal.
import 'server-only';

import { notifyEntityMembers } from '@/lib/notifications/notify';
import {
  type DeadlineSource,
  NOTICE_DAYS,
  OVERDUE_GRACE_DAYS,
  pendingDeadlines,
} from '@/lib/notifications/deadlines';
import { createAdminClient } from '@/lib/supabase/admin';
import { addDays } from '@/lib/reports/dates';
import { DEFAULT_TIMEZONE, todayIn } from '@/lib/utils/timezone';

const SETTLED_REMINDERS = ['paid', 'completed'];
const MAX_PER_ENTITY = 100;

export type DeadlineRunSummary = {
  entities: number;
  notified: number;
  /** Milestones claimed but not delivered; the claim is released for the next run. */
  failed: number;
};

export async function runDeadlineNotifications(now: Date = new Date()): Promise<DeadlineRunSummary> {
  const admin = createAdminClient();
  const { data: entities, error } = await admin
    .from('business_entities')
    .select('id, timezone, sales_tax_enabled')
    .eq('status', 'active');
  if (error) throw new Error('deadline_entities_read_failed');

  const summary: DeadlineRunSummary = { entities: 0, notified: 0, failed: 0 };

  for (const entity of entities ?? []) {
    const today = todayIn(entity.timezone ?? DEFAULT_TIMEZONE, now);
    const horizon = addDays(today, NOTICE_DAYS);
    // Bounded on both sides: the floor keeps a long-overdue row out of the query
    // entirely, and `order` makes `limit` take the nearest deadlines rather than
    // an arbitrary slice — without it Postgres may return any 100 of them.
    const floor = addDays(today, -OVERDUE_GRACE_DAYS);
    summary.entities += 1;

    const [{ data: reminders }, { data: obligations }] = await Promise.all([
      admin
        .from('reminders')
        .select('id, title, due_date, status')
        .eq('business_entity_id', entity.id)
        .not('published_at', 'is', null)
        .not('status', 'in', `(${SETTLED_REMINDERS.join(',')})`)
        .gte('due_date', floor)
        .lte('due_date', horizon)
        .order('due_date', { ascending: true })
        .limit(MAX_PER_ENTITY),
      admin
        .from('tax_obligations')
        .select('id, tax_type, due_date, tax_year, status')
        .eq('business_entity_id', entity.id)
        .not('published_at', 'is', null)
        .is('superseded_by', null)
        .neq('status', 'paid')
        .not('due_date', 'is', null)
        .gte('due_date', floor)
        .lte('due_date', horizon)
        .order('due_date', { ascending: true })
        .limit(MAX_PER_ENTITY),
    ]);

    const sources: DeadlineSource[] = [
      ...(reminders ?? []).map((row) => ({
        kind: 'reminder.due' as const,
        id: row.id,
        dueDate: row.due_date,
        title: row.title,
        payload: { dueDate: row.due_date },
        linkPath: '/dashboard#reminders',
      })),
      ...(obligations ?? []).flatMap((row) =>
        row.due_date
          ? [
              {
                kind: 'tax.deadline' as const,
                id: row.id,
                dueDate: row.due_date,
                title: row.tax_type,
                payload: {
                  dueDate: row.due_date,
                  taxType: row.tax_type,
                  ...(row.tax_year ? { taxYear: row.tax_year } : {}),
                },
                linkPath: taxLink(row.tax_type, entity.sales_tax_enabled),
              },
            ]
          : [],
      ),
    ];
    if (sources.length === 0) continue;

    const { data: claims } = await admin
      .from('notification_dispatches')
      .select('kind, resource_id, milestone')
      .eq('business_entity_id', entity.id)
      .in(
        'resource_id',
        sources.map((source) => source.id),
      );
    const claimed = new Set(
      (claims ?? []).map((claim) => `${claim.kind}:${claim.resource_id}:${claim.milestone}`),
    );

    for (const pending of pendingDeadlines(sources, today, claimed)) {
      // Claim first: two overlapping cron runs must not both notify. If the
      // send then fails the claim is released, so the next run retries rather
      // than swallowing a deadline.
      const { error: claimError } = await admin.from('notification_dispatches').insert({
        kind: pending.kind,
        resource_id: pending.id,
        milestone: pending.milestone,
        business_entity_id: entity.id,
      });
      if (claimError) continue;

      try {
        await notifyEntityMembers({
          entityId: entity.id,
          kind: pending.kind,
          title: pending.title,
          linkPath: pending.linkPath,
          payload: { ...pending.payload, milestone: pending.milestone },
        });
        summary.notified += 1;
      } catch {
        summary.failed += 1;
        await admin
          .from('notification_dispatches')
          .delete()
          .eq('kind', pending.kind)
          .eq('resource_id', pending.id)
          .eq('milestone', pending.milestone);
      }
    }
  }

  return summary;
}

/** Sales Taxes is gated per business; a link to a module the client cannot open would 404. */
function taxLink(taxType: string, salesTaxEnabled: boolean | null): string {
  if (taxType === 'income') return '/taxes/income';
  if (taxType === 'sales' && salesTaxEnabled) return '/taxes/sales';
  return '/dashboard#reminders';
}
