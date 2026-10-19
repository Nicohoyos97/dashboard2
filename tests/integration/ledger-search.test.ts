// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { CitationRegistry } from '@/lib/ai/nick/citations';
import type { ToolContext } from '@/lib/ai/nick/tools/context';
import { searchTransactions } from '@/lib/ai/nick/tools/ledger';
import { ledgerCsv } from '@/lib/ledger/csv';
import { loadLineLedger } from '@/lib/ledger/load';

import { Fixtures, type Tenant, supabaseEnv } from '../e2e/helpers/fixtures';

// "How much did I pay Meta?" and the account CSV, through the client's own
// RLS-scoped session against local Supabase: a published September P&L, the
// ledger behind it, and — in the same ledger — a bank account the client must
// never read, holding a line that names the same payee.
const env = supabaseEnv();

describe.skipIf(!env)('the transactions behind the P&L, as the client reads them', () => {
  const fx = new Fixtures();
  let tenant: Tenant;
  let marketingLine = '';
  afterAll(() => fx.cleanup());

  beforeAll(async () => {
    tenant = await fx.makeTenant('gl-search');
    const now = new Date().toISOString();
    const { data: report } = await fx.admin
      .from('financial_reports')
      .insert({
        business_entity_id: tenant.entityId, report_type: 'profit_and_loss', basis: 'accrual', currency: 'USD',
        period_start: '2026-09-01', period_end: '2026-09-30', source: 'firm_document', status: 'published',
        published_at: now, confidence: 0.98, reconciliation: { passed: true, checks: [] },
      })
      .select('id')
      .single();
    let position = 0;
    const line = async (name: string, opts: { parent?: string; current?: number; isSection?: boolean; isTotal?: boolean } = {}) => {
      const { data } = await fx.admin
        .from('financial_statement_lines')
        .insert({
          report_id: report!.id, business_entity_id: tenant.entityId, parent_line_id: opts.parent ?? null,
          position: (position += 1), depth: opts.parent ? 1 : 0, account_name: name, current: opts.current ?? null,
          is_section: opts.isSection ?? false, is_total: opts.isTotal ?? false, confidence: 0.98, source: 'firm_document',
        })
        .select('id')
        .single();
      return data!.id;
    };
    const income = await line('Income', { isSection: true });
    await line('Catering', { parent: income, current: 1000 });
    const expenses = await line('Expenses', { isSection: true });
    marketingLine = await line('Marketing', { parent: expenses, current: 503.09 });
    await line('Total Expenses', { parent: expenses, isTotal: true, current: 503.09 });

    const { data: ledger } = await fx.admin
      .from('general_ledgers')
      .insert({ business_entity_id: tenant.entityId, period_start: '2026-09-01', period_end: '2026-09-30', basis: 'accrual', status: 'published', published_at: now })
      .select('id')
      .single();
    const account = async (name: string, total: number, count: number, visible: boolean) => {
      const { data } = await fx.admin
        .from('ledger_accounts')
        .insert({ ledger_id: ledger!.id, business_entity_id: tenant.entityId, name, position: (position += 1), total, transaction_count: count, client_visible: visible })
        .select('id')
        .single();
      return data!.id;
    };
    const checking = await account('Checking ••4410', -503.09, 1, false);
    const catering = await account('Catering', 1000, 1, true);
    const marketing = await account('Marketing', 503.09, 2, true);
    const txn = (accountId: string, date: string, amount: number, name: string | null, description: string) => ({
      ledger_id: ledger!.id, account_id: accountId, business_entity_id: tenant.entityId, txn_date: date,
      txn_type: 'Expense', name, description, amount, position: (position += 1),
    });
    await fx.admin.from('ledger_transactions').insert([
      txn(marketing, '2026-09-05', 300, 'Meta Platforms', 'Instagram ads'),
      txn(marketing, '2026-09-28', 203.09, null, 'META ADS 8812 100% OFF'),
      txn(catering, '2026-09-14', 1000, 'Meta Platforms', 'Office lunch'),
      txn(checking, '2026-09-28', -503.09, 'Meta Platforms', 'Card payment'),
    ]);
  });

  const tool = (): ToolContext => ({
    supabase: tenant.client,
    admin: () => fx.admin,
    entityId: tenant.entityId,
    entityName: 'GL Search Co',
    currency: 'USD',
    locale: 'en',
    today: '2026-10-19',
    userId: tenant.userId,
    sessionId: 'session',
    context: { page: 'chat', period: null, line: null },
    registry: new CitationRegistry(),
    confirmedAction: null,
    setPendingAction: () => undefined,
  });

  it('answers what was paid and what was received, from the P&L accounts only', async () => {
    const out = await searchTransactions(tool(), { query: 'meta', period: null });
    expect(out).toMatchObject({
      available: true,
      matches: 3,
      paid: { count: 2, total: { amount: '503.09' } },
      received: { count: 1, total: { amount: '1000.00' } },
    });
    // The bank account's line names Meta too, and RLS keeps it out of reach.
    expect(JSON.stringify(out)).not.toContain('Card payment');
  });

  it('reads what the user typed as text, never as a wildcard', async () => {
    expect(await searchTransactions(tool(), { query: '100%', period: null })).toMatchObject({ matches: 1 });
    expect(await searchTransactions(tool(), { query: '_eta', period: null })).toMatchObject({ matches: 0 });
  });

  it('says which months exist when the period asked for has no ledger', async () => {
    expect(await searchTransactions(tool(), { query: 'meta', period: '2025-01-01_2025-01-31' })).toMatchObject({
      available: false,
      reason: 'no_ledger_for_period',
    });
  });

  it('exports an account as the client sees it: its transactions and nothing else', async () => {
    const found = await loadLineLedger(tenant.client, tenant.entityId, marketingLine);
    expect(found?.detail).toMatchObject({ count: 2, totalCents: 50_309 });
    const csv = ledgerCsv(found!.line.accountName, found!.txns, 'en').split('\r\n');
    expect(csv).toHaveLength(3);
    expect(csv[1]).toBe('Marketing,2026-09-28,,META ADS 8812 100% OFF,Expense,,,203.09');
  });
});
