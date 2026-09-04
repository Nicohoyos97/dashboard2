import { expect, test } from '@playwright/test';

import { Fixtures, adminClient, supabaseEnv } from './helpers/fixtures';

// The Expenses page reads its figures from `portal_expense_summary` (migration
// 0011) rather than adding rows up in the request, so the SQL is what has to be
// right. These assert its numbers against rows whose totals are known by hand,
// and that a draft statement or another tenant contributes nothing.
test.describe('expense aggregates', () => {
  test.skip(!supabaseEnv(), 'Supabase env not available');

  const fx = new Fixtures();
  test.afterAll(() => fx.cleanup());

  /** A published account + statement, plus one draft statement, for `entityId`. */
  async function seed(entityId: string) {
    const admin = adminClient();
    const account = await admin
      .from('bank_accounts')
      .insert({ business_entity_id: entityId, institution: 'Test Bank', masked_number: '••••0001', account_type: 'checking', currency: 'USD' })
      .select('id')
      .single();
    const accountId = account.data?.id as string;

    const categories = await admin
      .from('expense_categories')
      .insert([
        { business_entity_id: entityId, name: 'Rent', kind: 'occupancy', is_fixed: true },
        { business_entity_id: entityId, name: 'Wages', kind: 'payroll', is_fixed: false },
      ])
      .select('id, name');
    const categoryId = new Map((categories.data ?? []).map((row) => [row.name, row.id]));

    const statement = async (start: string, end: string, status: 'published' | 'needs_review') => {
      const row = await admin
        .from('bank_statements')
        .insert({
          business_entity_id: entityId,
          bank_account_id: accountId,
          period_start: start,
          period_end: end,
          source: 'firm_document',
          status,
          ...(status === 'published' ? { published_at: new Date().toISOString() } : {}),
        })
        .select('id')
        .single();
      return row.data?.id as string;
    };

    const published = await statement('2026-01-01', '2026-02-28', 'published');
    const draft = await statement('2026-03-01', '2026-03-31', 'needs_review');

    const txn = (statementId: string, key: string, date: string, debit: number, extra: Record<string, unknown> = {}) => ({
      business_entity_id: entityId,
      bank_account_id: accountId,
      bank_statement_id: statementId,
      txn_date: date,
      description: `row ${key}`,
      debit,
      source: 'firm_document' as const,
      dedupe_key: `${entityId}-${key}`,
      ...extra,
    });

    await admin.from('bank_transactions').insert([
      // January: 100 rent (recurring, fixed) + 250 wages = 350
      txn(published, 'a', '2026-01-10', 100, { category_id: categoryId.get('Rent'), vendor: 'Landlord', is_recurring: true }),
      txn(published, 'b', '2026-01-20', 250, { category_id: categoryId.get('Wages'), vendor: 'Payroll Co', is_recurring: false }),
      // February: 100 rent + 40 uncategorised (no recurring flag) = 140
      txn(published, 'c', '2026-02-10', 100, { category_id: categoryId.get('Rent'), vendor: 'Landlord', is_recurring: true }),
      txn(published, 'd', '2026-02-15', 40),
      // A credit is money in, never an expense.
      { ...txn(published, 'e', '2026-02-16', 0), debit: null, credit: 900 },
      // On a statement the firm has not published: must not count.
      txn(draft, 'f', '2026-03-05', 999, { category_id: categoryId.get('Rent') }),
    ]);
  }

  test('groups only published debits, and keeps an unset recurring flag unknown', async () => {
    const tenant = await fx.makeTenant('agg-a');
    await seed(tenant.entityId);

    const { data, error } = await tenant.client.rpc('portal_expense_summary', {
      p_entity: tenant.entityId,
      p_currency: 'USD',
      p_start: '2026-01-01',
      p_end: '2026-03-31',
    });
    expect(error).toBeNull();
    const summary = data as {
      total_cents: number;
      count: number;
      uncategorized_cents: number;
      by_kind: Record<string, number>;
      recurring: { yes: number; no: number; unknown: number };
      fixed: { yes: number; no: number; unknown: number };
      by_category: { label: string | null; cents: number; count: number }[];
      by_vendor: { label: string | null; cents: number }[];
      by_month: { month: string; cents: number }[];
    };

    // 100 + 250 + 100 + 40 = 490; the credit and the draft row are excluded.
    expect(summary.total_cents).toBe(490_00);
    expect(summary.count).toBe(4);
    expect(summary.by_kind).toEqual({ occupancy: 200_00, payroll: 250_00 });
    expect(summary.uncategorized_cents).toBe(40_00);
    // The 40 has no flag: unknown, not "no".
    expect(summary.recurring).toEqual({ yes: 200_00, no: 250_00, unknown: 40_00 });
    // is_fixed is a property of the category, so the uncategorised row is unknown too.
    expect(summary.fixed).toEqual({ yes: 200_00, no: 250_00, unknown: 40_00 });
    expect(summary.by_category[0]).toMatchObject({ label: 'Wages', cents: 250_00, count: 1 });
    expect(summary.by_vendor.map((v) => [v.label, v.cents])).toEqual([
      ['Payroll Co', 250_00],
      ['Landlord', 200_00],
      [null, 40_00],
    ]);
    // Zero-filled across the whole range, March included.
    expect(summary.by_month).toEqual([
      { month: '2026-01', cents: 350_00 },
      { month: '2026-02', cents: 140_00 },
      { month: '2026-03', cents: 0 },
    ]);
  });

  test('applies each filter the page offers', async () => {
    const tenant = await fx.makeTenant('agg-b');
    await seed(tenant.entityId);
    const base = { p_entity: tenant.entityId, p_currency: 'USD', p_start: '2026-01-01', p_end: '2026-03-31' };
    const total = async (args: Record<string, unknown>) => {
      const { data, error } = await tenant.client.rpc('portal_expense_summary', { ...base, ...args });
      expect(error).toBeNull();
      return (data as { total_cents: number }).total_cents;
    };

    expect(await total({ p_vendor: 'Landlord' })).toBe(200_00);
    expect(await total({ p_recurring: true })).toBe(200_00);
    expect(await total({ p_min: 200 })).toBe(250_00);
    expect(await total({ p_max: 50 })).toBe(40_00);
    expect(await total({ p_search: 'row a' })).toBe(100_00);
    // The function escapes LIKE's metacharacters itself (0012), so a wildcard
    // typed into the search box matches literally instead of everything.
    expect(await total({ p_search: 'row %' })).toBe(0);
    expect(await total({ p_search: 'row _' })).toBe(0);
  });

  test('returns nothing for another tenant, whatever entity id is passed', async () => {
    const a = await fx.makeTenant('agg-c');
    const b = await fx.makeTenant('agg-d');
    await seed(a.entityId);

    // B asks for A's business: the function is SECURITY INVOKER, so RLS applies.
    const { data } = await b.client.rpc('portal_expense_summary', {
      p_entity: a.entityId,
      p_currency: 'USD',
      p_start: '2026-01-01',
      p_end: '2026-03-31',
    });
    expect((data as { total_cents: number; count: number }).total_cents).toBe(0);
    expect((data as { count: number }).count).toBe(0);

    const vendors = await b.client.rpc('portal_expense_vendors', {
      p_entity: a.entityId,
      p_currency: 'USD',
      p_start: '2026-01-01',
      p_end: '2026-03-31',
    });
    expect(vendors.data ?? []).toHaveLength(0);

    // Positive control: A sees its own.
    const own = await a.client.rpc('portal_expense_vendors', {
      p_entity: a.entityId,
      p_currency: 'USD',
      p_start: '2026-01-01',
      p_end: '2026-03-31',
    });
    expect((own.data ?? []).map((row) => row.vendor)).toEqual(['Landlord', 'Payroll Co']);
  });
});
