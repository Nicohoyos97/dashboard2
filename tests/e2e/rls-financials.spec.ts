import { expect, test } from '@playwright/test';

import {
  type Db,
  Fixtures,
  type Tenant,
  elevateToAal2,
  insertDenied,
  supabaseEnv,
} from './helpers/fixtures';

// Every §5 ingestion table (0004_financials.sql, 0005_tax_reminders.sql).
// Reports, statements, obligations and reminders are publication-gated for
// members; lines and transactions follow their parent through
// report_is_published() / bank_statement_is_published(). Derived rows (lines,
// transactions, insights, citations, usage) have NO client write path at all.
// The firm reads everything except conversations; only the service role
// touches ai_usage_daily and rate_limits.
const GATED = [
  'financial_reports',
  'financial_statement_lines',
  'bank_statements',
  'bank_transactions',
  'tax_obligations',
  'tax_payments',
  'payroll_obligations',
  'reminders',
] as const;
const OPEN = [
  'insights',
  'bank_accounts',
  'financial_periods',
  'expense_categories',
  'tax_jurisdictions',
] as const;
type EntityTable = (typeof GATED)[number] | (typeof OPEN)[number];
const LINES = 'financial_statement_lines';
const NONE = Object.fromEntries(GATED.map((t) => [t, 0]));
const ALL = { ...Object.fromEntries(GATED.map((t) => [t, 1])), [LINES]: 2 };
const OPEN_ALL = { insights: 1, bank_accounts: 1, financial_periods: 1, expense_categories: 1, tax_jurisdictions: 1 };
const OPEN_NONE = { insights: 0, bank_accounts: 0, financial_periods: 0, expense_categories: 0, tax_jurisdictions: 0 };
const PERIOD = { period_start: '2026-01-01', period_end: '2026-01-31' };
const TXN = { txn_date: '2026-01-05', description: 'Demo vendor', debit: 42, dedupe_key: 'e2e-1' };

type Rows = PromiseLike<{ data: unknown[] | null }>;
const n = async (q: Rows): Promise<number> => ((await q).data ?? []).length;
const zeroRows = async (q: Rows) => expect(await n(q)).toBe(0);
const denied = async (q: PromiseLike<{ error: unknown; data: unknown[] | null }>) =>
  expect(insertDenied(await q)).toBe(true);

const rows = (db: Db, table: EntityTable, entityId: string): Promise<number> =>
  n(db.from(table).select('id').eq('business_entity_id', entityId));

// { table: rowCount } for one caller, so a whole visibility state is one assertion.
const counts = async (db: Db, tables: readonly EntityTable[], entityId: string) =>
  Object.fromEntries(
    await Promise.all(
      tables.map(async (t): Promise<[EntityTable, number]> => [t, await rows(db, t, entityId)]),
    ),
  );

// Insert returning the new id, or a loud failure: the seed is not the thing under test.
async function one(
  q: PromiseLike<{ data: { id: string } | null; error: { message: string } | null }>,
): Promise<string> {
  const r = await q;
  if (r.error || !r.data) throw new Error(`seed: ${r.error?.message ?? 'no row'}`);
  return r.data.id;
}

test.describe('RLS financials, taxes, reminders and AI tables', () => {
  test.skip(!supabaseEnv(), 'Supabase env not available');

  const fx = new Fixtures();
  const A = fx.admin;
  const exported: string[] = [];
  test.afterAll(async () => {
    if (exported.length) await A.storage.from('exports').remove(exported);
    await fx.cleanup();
  });

  async function seedUsage(entityId: string): Promise<void> {
    const usage = {
      business_entity_id: entityId,
      day: '2026-09-01',
      input_tokens: 100,
      messages: 2,
    };
    const r = await A.from('ai_usage_daily').insert(usage);
    if (r.error) throw new Error(`seed ai_usage_daily: ${r.error.message}`);
  }

  // One unpublished row per table for business B (service role = the worker),
  // a notification for each user, and a Nick conversation B started itself.
  async function seed(b: Tenant, a: Tenant) {
    const be = { business_entity_id: b.entityId };
    const report = { ...be, report_type: 'profit_and_loss', source: 'firm_document', ...PERIOD };
    const reportId = await one(A.from('financial_reports').insert(report).select('id').single());
    const line = { ...be, report_id: reportId };
    const revenue = { ...line, position: 1, account_name: 'Revenue', current: 1000 };
    const payroll = { ...line, position: 2, account_name: 'Payroll Expense', current: 400 };
    const lineIds = [
      await one(A.from(LINES).insert(revenue).select('id').single()),
      await one(A.from(LINES).insert(payroll).select('id').single()),
    ];
    const account = { ...be, institution: 'Demo Bank', masked_number: '••••1234' };
    const accountId = await one(A.from('bank_accounts').insert(account).select('id').single());
    const stmt = { ...be, bank_account_id: accountId, source: 'firm_document', ...PERIOD };
    const statementId = await one(A.from('bank_statements').insert(stmt).select('id').single());
    const txn = { ...be, bank_account_id: accountId, bank_statement_id: statementId, ...TXN };
    await one(A.from('bank_transactions').insert(txn).select('id').single());
    const oblig = { ...be, tax_type: 'sales', source: 'firm_entry' };
    const obligationId = await one(A.from('tax_obligations').insert(oblig).select('id').single());
    const payment = { ...be, obligation_id: obligationId, paid_on: '2026-02-20', amount: 42, source: 'firm_entry' };
    const paymentId = await one(A.from('tax_payments').insert(payment).select('id').single());
    const payrollRow = { ...be, source: 'firm_entry', pay_date: '2026-01-31' };
    const payrollId = await one(A.from('payroll_obligations').insert(payrollRow).select('id').single());
    const category = { ...be, name: 'Payroll' };
    await one(A.from('expense_categories').insert(category).select('id').single());
    const jurisdiction = { ...be, tax_type: 'sales', level: 'state', name: 'Florida', code: 'US-FL' };
    await one(A.from('tax_jurisdictions').insert(jurisdiction).select('id').single());
    const rem = { ...be, reminder_type: 'custom', title: 'Sales tax', due_date: '2026-02-20' };
    const reminderId = await one(A.from('reminders').insert(rem).select('id').single());
    const insight = { ...be, rule_key: 'e2e.demo', severity: 'info', title: 'Demo', body: 'Demo' };
    await one(A.from('insights').insert(insight).select('id').single());
    const fp = { ...be, period_type: 'month', start_date: '2026-01-01', end_date: '2026-01-31' };
    await one(A.from('financial_periods').insert(fp).select('id').single());
    const note = { kind: 'report_published', title: 'Demo' };
    const noteB = { ...be, ...note, user_id: b.userId };
    const noteA = { business_entity_id: a.entityId, ...note, user_id: a.userId };
    await one(A.from('notifications').insert(noteB).select('id').single());
    await one(A.from('notifications').insert(noteA).select('id').single());
    await seedUsage(b.entityId);

    // The client starts its own conversation; the server writes the answer + citation.
    const session = { ...be, user_id: b.userId, title: 'Nick' };
    const sessionId = await one(
      b.client.from('chat_sessions').insert(session).select('id').single(),
    );
    const msg = { ...be, session_id: sessionId, role: 'assistant', content: { text: '400 [c1]' } };
    const messageId = await one(A.from('chat_messages').insert(msg).select('id').single());
    const cite = { ...be, session_id: sessionId, message_id: messageId, report_id: reportId };
    const citation = { ...cite, citation_key: 'c1', label: 'P&L · Jan 2026 · Payroll Expense' };
    await one(A.from('chat_citations').insert(citation).select('id').single());
    return { reportId, lineIds, accountId, statementId, obligationId, paymentId, payrollId, reminderId, sessionId };
  }
  type Seed = Awaited<ReturnType<typeof seed>>;

  async function publish(s: Seed): Promise<void> {
    const now = new Date().toISOString();
    const done = { status: 'published', published_at: now };
    const results = await Promise.all([
      A.from('financial_reports').update(done).eq('id', s.reportId),
      A.from('bank_statements').update(done).eq('id', s.statementId),
      A.from('tax_obligations').update({ published_at: now }).eq('id', s.obligationId),
      A.from('tax_payments').update({ published_at: now }).eq('id', s.paymentId),
      A.from('payroll_obligations').update({ published_at: now }).eq('id', s.payrollId),
      A.from('reminders').update({ published_at: now }).eq('id', s.reminderId),
    ]);
    for (const r of results) if (r.error) throw new Error(`publish: ${r.error.message}`);
  }

  test('members see only published rows; children follow their parent; open tables are open', async () => {
    const a = await fx.makeTenant('ga');
    const b = await fx.makeTenant('gb');
    const s = await seed(b, a);
    const cites = (db: Db) =>
      n(db.from('chat_citations').select('id').eq('session_id', s.sessionId));

    // Unpublished: every gated table is empty even for its own member…
    expect(await counts(b.client, GATED, b.entityId)).toEqual(NONE);
    // …while tables that are not publication-gated are readable right away.
    expect(await counts(b.client, OPEN, b.entityId)).toEqual(OPEN_ALL);
    expect(await cites(b.client)).toBe(1);
    // Notifications are self-only, not entity-scoped: each user sees exactly their own.
    const bNotes = await b.client.from('notifications').select('user_id');
    expect(bNotes.data?.map((x) => x.user_id)).toEqual([b.userId]);
    const aNotes = await a.client.from('notifications').select('user_id');
    expect(aNotes.data?.map((x) => x.user_id)).toEqual([a.userId]);

    await publish(s);

    // Published: B sees each row plus the children of published parents; A nothing.
    expect(await counts(b.client, GATED, b.entityId)).toEqual(ALL);
    expect(await counts(a.client, GATED, b.entityId)).toEqual(NONE);
    expect(await counts(a.client, OPEN, b.entityId)).toEqual(OPEN_NONE);
    expect(await cites(a.client)).toBe(0);
  });

  test('clients cannot write to any ingestion table', async () => {
    const a = await fx.makeTenant('wa');
    const b = await fx.makeTenant('wb');
    const s = await seed(b, a);
    await publish(s);
    const db = b.client;
    const be = { business_entity_id: b.entityId };
    const lineId = s.lineIds[0]!;

    // Positive control: B reads the published report it is about to attack.
    expect(await rows(db, 'financial_reports', b.entityId)).toBe(1);

    // Derived tables have no client write policy at all; configuration tables
    // are firm-admin only. Every attempt names B's own business.
    const line = { ...be, report_id: s.reportId, position: 3, account_name: 'Forged' };
    await denied(db.from(LINES).insert(line).select());
    await zeroRows(db.from(LINES).update({ current: 1 }).eq('id', lineId).select());
    const report = { ...be, report_type: 'balance_sheet', source: 'firm_entry', ...PERIOD };
    await denied(db.from('financial_reports').insert(report).select());
    const txn = { ...be, bank_account_id: s.accountId, bank_statement_id: s.statementId, ...TXN };
    await denied(
      db
        .from('bank_transactions')
        .insert({ ...txn, dedupe_key: 'forged' })
        .select(),
    );
    await zeroRows(db.from('reminders').update({ status: 'paid' }).eq('id', s.reminderId).select());
    const insight = { ...be, rule_key: 'forged', severity: 'critical', title: 'x', body: 'y' };
    await denied(db.from('insights').insert(insight).select());
    await denied(
      db
        .from('ai_usage_daily')
        .insert({ ...be, day: '2026-09-02' })
        .select(),
    );

    // The figure the client tried to change is intact.
    const after = await A.from(LINES).select('current').eq('id', lineId).single();
    expect(after.data?.current).toBe(1000);
  });

  test('firm at aal2 reads everything but conversations; master_admin corrects, firm_staff cannot', async () => {
    const a = await fx.makeTenant('fa');
    const b = await fx.makeTenant('fb');
    const admin = await fx.makeFirmUser('f-admin');
    const staff = await fx.makeFirmUser('f-staff', 'firm_staff');
    await Promise.all([elevateToAal2(admin.client), elevateToAal2(staff.client)]);
    const s = await seed(b, a);
    const db = admin.client;
    const lineId = s.lineIds[1]!;

    // Drafts included: the firm reviews before publishing.
    expect(await counts(db, GATED, b.entityId)).toEqual(ALL);
    expect(await counts(db, OPEN, b.entityId)).toEqual(OPEN_ALL);
    expect(await counts(staff.client, GATED, b.entityId)).toEqual(ALL);

    // Conversations and other people's notifications stay private.
    await zeroRows(db.from('chat_citations').select('id').eq('session_id', s.sessionId));
    await zeroRows(db.from('notifications').select('id').eq('user_id', b.userId));

    // master_admin corrects an extracted figure and adds a reminder.
    const fix = await db
      .from(LINES)
      .update({ current: 450, corrected_by: admin.userId })
      .eq('id', lineId)
      .select('current, corrected_by');
    expect(fix.error).toBeNull();
    expect(fix.data?.[0]).toEqual({ current: 450, corrected_by: admin.userId });
    const be = { business_entity_id: b.entityId };
    const rem = { ...be, reminder_type: 'custom', title: 'Renew', due_date: '2026-03-01' };
    const ins = await db.from('reminders').insert(rem).select('id');
    expect(ins.error).toBeNull();
    expect(ins.data).toHaveLength(1);

    // firm_staff is read-only: lines_admin_update checks is_firm_admin().
    await zeroRows(staff.client.from(LINES).update({ current: 0 }).eq('id', lineId).select());
  });

  test('ai_usage_daily is firm-read only; rate_limits belong to the service role', async () => {
    const b = await fx.makeTenant('rb');
    const admin = await fx.makeFirmUser('r-admin');
    await elevateToAal2(admin.client);
    await seedUsage(b.entityId);

    // The firm's "Nick usage" view reads it; the client never sees token counts.
    const usage = (db: Db) =>
      n(db.from('ai_usage_daily').select('day').eq('business_entity_id', b.entityId));
    expect(await usage(b.client)).toBe(0);
    expect(await usage(admin.client)).toBe(1);

    // consume_rate_limit(): EXECUTE is service_role only so a client cannot
    // poison the counter; the service role sees a fixed window of 2.
    const key = `e2e:${b.entityId}`;
    const args = { p_key: key, p_max: 2, p_window: '1 minute' };
    expect((await b.client.rpc('consume_rate_limit', args)).error).not.toBeNull();
    const window: (boolean | null)[] = [];
    for (let i = 0; i < 3; i += 1) {
      const r = await A.rpc('consume_rate_limit', args);
      expect(r.error).toBeNull();
      window.push(r.data);
    }
    expect(window).toEqual([true, true, false]);

    // rate_limits has RLS on and no policies: the row just written is invisible to everyone else.
    const limits = (db: Db) => n(db.from('rate_limits').select('key').eq('key', key));
    expect(await limits(b.client)).toBe(0);
    expect(await limits(admin.client)).toBe(0);
    expect(await limits(A)).toBe(1);
  });

  test('an export row belongs to the member who asked for it, not to the business', async () => {
    // generated_exports carries the only policy in the schema that combines
    // entity membership with `user_id = auth.uid()`, and it is the whole
    // authorization for /api/exports/<id>/download — the route does no
    // membership check of its own. The bucket policy behind it is entity-scoped,
    // not user-scoped, so if the user_id clause were ever dropped a co-member
    // would download someone else's export and the storage test would still pass.
    const owner = await fx.makeTenant('ea');
    const coMember = await fx.makeUser('eb');
    await fx.addMembership(owner.entityId, coMember.id, 'client_viewer');
    const coMemberClient = await fx.signedInClient(coMember.email);
    const outsider = await fx.makeTenant('ec');

    const row = {
      business_entity_id: owner.entityId,
      user_id: owner.userId,
      kind: 'csv',
      storage_path: `${owner.entityId}/e2e-export/report.csv`,
      status: 'ready',
    };
    const exportId = await one(A.from('generated_exports').insert(row).select('id').single());
    const readable = (db: Db) => n(db.from('generated_exports').select('id').eq('id', exportId));

    expect(await readable(owner.client)).toBe(1);
    expect(await readable(coMemberClient)).toBe(0);
    expect(await readable(outsider.client)).toBe(0);

    // No client write path either: the server creates the row.
    const forged = await coMemberClient
      .from('generated_exports')
      .insert({ ...row, storage_path: `${owner.entityId}/forged/report.csv` });
    expect(forged.error).not.toBeNull();
  });

  test('notification_dispatches is invisible to clients and to the firm', async () => {
    // RLS on, zero policies — safe by construction, like rate_limits. The point
    // of the test is that adding a policy later cannot go unnoticed.
    const b = await fx.makeTenant('na');
    const admin = await fx.makeFirmUser('nadmin');
    await elevateToAal2(admin.client);
    const claim = {
      kind: 'reminder.due',
      resource_id: b.entityId,
      milestone: 'due_today',
      business_entity_id: b.entityId,
    };
    const written = await A.from('notification_dispatches').insert(claim);
    expect(written.error).toBeNull();

    const visible = (db: Db) =>
      n(db.from('notification_dispatches').select('kind').eq('business_entity_id', b.entityId));
    expect(await visible(b.client)).toBe(0);
    expect(await visible(admin.client)).toBe(0);
    expect(await visible(A)).toBe(1);
  });

  test('exports bucket: members sign their own entity folder; no client writes', async () => {
    const a = await fx.makeTenant('xa');
    const b = await fx.makeTenant('xb');
    const csv = Buffer.from('account,amount\nRevenue,1000\n');
    const opts = { contentType: 'text/csv' };
    const path = `${b.entityId}/exp1/report.csv`;
    const evilPath = `${b.entityId}/exp2/evil.csv`;
    exported.push(path, evilPath);
    const up = await A.storage.from('exports').upload(path, csv, opts);
    expect(up.error).toBeNull();

    // exports_member_read: is_entity_member(object_entity_id(name)).
    const own = await b.client.storage.from('exports').createSignedUrl(path, 60);
    expect(own.error).toBeNull();
    expect((await fetch(own.data!.signedUrl)).status).toBe(200);
    const cross = await a.client.storage.from('exports').createSignedUrl(path, 60);
    expect(cross.error).not.toBeNull();

    // Files are generated server-side; the bucket has no INSERT policy for anyone.
    const write = await b.client.storage.from('exports').upload(evilPath, csv, opts);
    expect(write.error).not.toBeNull();
  });
});
