import { type Page, expect, test } from '@playwright/test';

import { rangeLineId } from '@/lib/reports/range';

import { Fixtures, PASSWORD, supabaseEnv } from './helpers/fixtures';

// The report period, QuickBooks' way: a named period or any two dates. Dates
// no single published statement covers are added up from the published
// statements and, inside a month, from its General Ledger's own transactions
// (lib/reports/range.ts) — here the 15th of one month to the 15th of the next.
test.describe('Report period: any dates, added up from the published books', () => {
  test.skip(!supabaseEnv(), 'Supabase env not available');
  test.setTimeout(120_000);

  const fx = new Fixtures();
  test.afterAll(() => fx.cleanup());

  async function signIn(page: Page, email: string) {
    await page.goto('/signin');
    await page.fill('#email', email);
    await page.fill('#password', PASSWORD);
    await page.getByRole('button', { name: /^sign in$/i }).click();
    await expect(page).toHaveURL(/\/dashboard/);
  }

  // The business's "last month" and the month before it, in UTC (the default time zone).
  const iso = (date: Date) => date.toISOString().slice(0, 10);
  const now = new Date();
  const monthOf = (back: number) => {
    const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1));
    const last = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back + 1, 0));
    const day = (n: number) => iso(new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), n)));
    return { start: iso(first), end: iso(last), day };
  };
  const earlier = monthOf(2);
  const last = monthOf(1);
  const range = `${earlier.day(15)}_${last.day(15)}`;

  type Month = ReturnType<typeof monthOf>;
  type Figures = { sales: [number, number][]; rent: [number, number][]; utilities: [number, number][] };

  /** A published P&L for the month and, unless told otherwise, its published General Ledger. */
  async function seedMonth(entityId: string, month: Month, figures: Figures, withLedger = true) {
    const total = (list: [number, number][]) => list.reduce((sum, [, amount]) => sum + amount, 0);
    const sales = total(figures.sales);
    const rent = total(figures.rent);
    const utilities = total(figures.utilities);
    const published = new Date().toISOString();
    const { data: report, error } = await fx.admin
      .from('financial_reports')
      .insert({ business_entity_id: entityId, report_type: 'profit_and_loss', basis: 'accrual', currency: 'USD', period_start: month.start, period_end: month.end, source: 'firm_entry', status: 'published', published_at: published, reconciliation: { passed: true, checks: [], lowConfidence: { count: 0, refs: [] } } })
      .select('id')
      .single();
    if (error || !report) throw new Error(`seed report: ${error?.message}`);
    const ids = Array.from({ length: 9 }, () => crypto.randomUUID());
    const line = (i: number, name: string, current: number | null, parent: number | null, flags: { section?: boolean; total?: boolean } = {}) => ({
      id: ids[i]!, report_id: report.id, business_entity_id: entityId, parent_line_id: parent === null ? null : ids[parent]!, position: i,
      depth: parent === null ? 0 : 1, account_name: name, current, is_section: flags.section ?? false, is_total: flags.total ?? false, source: 'firm_entry',
    });
    const { error: linesError } = await fx.admin.from('financial_statement_lines').insert([
      line(0, 'Income', null, null, { section: true }),
      line(1, 'Sales', sales, 0),
      line(2, 'Total Income', sales, 0, { total: true }),
      line(3, 'Expenses', null, null, { section: true }),
      line(4, 'Rent', rent, 3),
      line(5, 'Utilities', utilities, 3),
      line(6, 'Total Expenses', rent + utilities, 3, { total: true }),
      line(7, 'Net Income', sales - rent - utilities, null, { total: true }),
    ]);
    if (linesError) throw new Error(`seed lines: ${linesError.message}`);
    if (!withLedger) return;

    const { data: ledger } = await fx.admin
      .from('general_ledgers')
      .insert({ business_entity_id: entityId, period_start: month.start, period_end: month.end, status: 'published', published_at: published })
      .select('id')
      .single();
    let position = 0;
    for (const [name, list] of [['Sales', figures.sales], ['Rent', figures.rent], ['Utilities', figures.utilities]] as const) {
      const { data: account } = await fx.admin
        .from('ledger_accounts')
        .insert({ ledger_id: ledger!.id, business_entity_id: entityId, name, position: position++, total: total(list), transaction_count: list.length, client_visible: true })
        .select('id')
        .single();
      const { error: txnError } = await fx.admin.from('ledger_transactions').insert(
        list.map(([day, amount], index) => ({
          ledger_id: ledger!.id, account_id: account!.id, business_entity_id: entityId, txn_date: month.day(day),
          txn_type: 'Expense', name: `${name} payee ${day}`, amount, position: position * 100 + index,
        })),
      );
      if (txnError) throw new Error(`seed transactions: ${txnError.message}`);
    }
  }

  async function seed(label: string, withLedger = true) {
    const tenant = await fx.makeTenant(label);
    await seedMonth(tenant.entityId, earlier, { sales: [[5, 4000], [20, 6000]], rent: [[1, 3000]], utilities: [[25, 500]] }, withLedger);
    await seedMonth(tenant.entityId, last, { sales: [[10, 5000], [25, 7000]], rent: [[1, 3000]], utilities: [[12, 700]] }, withLedger);
    return tenant;
  }

  test('the P&L for the 15th to the 15th is added up from both months’ ledgers', async ({ page }) => {
    const tenant = await seed('periods-range');
    await signIn(page, tenant.email);
    await page.goto(`/statements/profit-and-loss?period=${range}`);

    // Sales: 6,000 after the 15th of one month and 5,000 up to the 15th of the next.
    // Expenses: the 3,000 rent of the 1st falls only in the second month; utilities 500 + 700.
    await expect(page.getByText('$11,000.00').first()).toBeVisible();
    await expect(page.getByText('$4,200.00').first()).toBeVisible();
    await expect(page.getByText('$6,800.00').first()).toBeVisible();
    await expect(page.getByText(/added up from your published statements and General Ledger/)).toBeVisible();

    // QuickBooks' controls, and no Monthly · Quarterly · Annual toggle.
    const bar = page.getByRole('group', { name: 'Report period' });
    await expect(bar.getByRole('combobox', { name: 'Report period' })).toHaveValue('custom');
    await expect(bar.getByLabel('From', { exact: true })).toHaveValue(earlier.day(15));
    await expect(bar.getByLabel('To', { exact: true })).toHaveValue(last.day(15));
    await expect(page.getByRole('group', { name: /granularity/i })).toHaveCount(0);

    // A named period is the published statement itself.
    await bar.getByRole('combobox', { name: 'Report period' }).selectOption({ label: 'Last month' });
    await expect(page).toHaveURL(new RegExp(`period=${last.start}_${last.end}`));
    await expect(page.getByText('$12,000.00').first()).toBeVisible();

    // Typing dates runs the report for them.
    await bar.getByLabel('From', { exact: true }).fill(earlier.day(20));
    await bar.getByLabel('From', { exact: true }).press('Enter');
    await expect(page).toHaveURL(new RegExp(`period=${earlier.day(20)}_${last.end}`));
    await expect(page.getByText('$18,000.00').first()).toBeVisible();

    const csv = await page.request.get(`/api/reports/range/csv?period=${range}`);
    expect(csv.status()).toBe(200);
    expect(await csv.text()).toContain('Total Income');
  });

  test('Expenses opens an account onto exactly the transactions inside the dates', async ({ page }) => {
    const tenant = await seed('periods-expenses');
    await signIn(page, tenant.email);
    await page.goto(`/expenses?period=${range}`);

    const open = page.getByRole('button', { name: 'Show the transactions behind Utilities' });
    await expect(open).toContainText('2 transactions');
    const fetched = page.waitForResponse((r) => r.url().includes('/api/ledger/range?') && r.status() === 200);
    await open.click();
    await fetched;
    await expect(page.getByText(/These 2 transactions add up to \$1,200\.00/)).toBeVisible();

    // The Rent of the first month's 1st is outside the dates: one transaction, not two.
    await expect(page.getByRole('button', { name: 'Show the transactions behind Rent' })).toContainText('1 transaction');
  });

  test('says why when a month cannot be split, and never estimates it', async ({ page }) => {
    const tenant = await seed('periods-noledger', false);
    await signIn(page, tenant.email);
    await page.goto(`/statements/profit-and-loss?period=${range}`);
    await expect(page.getByText(/Splitting it by date takes its General Ledger/)).toBeVisible();
    await expect(page.getByText('$11,000.00')).toHaveCount(0);

    // Whole months need no ledger: the two months together are their statements added.
    await page.goto(`/statements/profit-and-loss?period=${earlier.start}_${last.end}`);
    await expect(page.getByText('$22,000.00').first()).toBeVisible();
    await expect(page.getByText(/added up from your published statements(?! and)/)).toBeVisible();
  });

  test('another business gets nothing from the range routes', async ({ page }) => {
    await seed('periods-owner');
    const stranger = await fx.makeTenant('periods-stranger');
    await signIn(page, stranger.email);
    const line = rangeLineId('expenses › utilities');
    expect((await page.request.get(`/api/ledger/range?period=${range}&line=${line}`)).status()).toBe(404);
    expect((await page.request.get(`/api/reports/range/csv?period=${range}`)).status()).toBe(404);
  });
});
