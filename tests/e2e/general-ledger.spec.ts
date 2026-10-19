import { expect, test } from '@playwright/test';

import { persistGeneralLedger } from '@/lib/ledger/persist';

import { LEDGER_CSV } from '../unit/ledger/fixtures';
import { Fixtures, type FirmUser, elevateToAal2, supabaseEnv } from './helpers/fixtures';

// The rules of 0026, against the database: a ledger is read by its own client
// only once published, and then only its P&L accounts — the bank, card, equity
// and liability accounts of the same file stay with the firm, as does the file.
// Driven with the invented export in tests/unit/ledger/fixtures.ts through the
// worker's own persistence.
const P_AND_L_ACCOUNTS = ['4000 - Coffee & food sales', '5000 - Coffee beans', '63001 - Electricity', '63005 - Internet'];

test.describe('General Ledger: what a client may read', () => {
  test.skip(!supabaseEnv(), 'Supabase env not available');

  const fx = new Fixtures();
  let firm: FirmUser | null = null;
  // Under fullyParallel a worker can run afterAll and come back to this file
  // with the module still cached: a remembered admin would be a deleted user,
  // whose updates RLS turns into silent no-ops.
  test.afterAll(async () => {
    firm = null;
    await fx.cleanup();
  });

  async function firmAdmin(): Promise<FirmUser> {
    if (firm) return firm;
    firm = await fx.makeFirmUser('gl-admin');
    await elevateToAal2(firm.client);
    return firm;
  }

  async function ledgerFor(label: string) {
    const tenant = await fx.makeTenant(label);
    const { data: doc } = await fx.admin
      .from('documents')
      .insert({ business_entity_id: tenant.entityId, document_type: 'general_ledger', title: `${label} GL`, status: 'processing' })
      .select('id')
      .single();
    const { data: version } = await fx.admin
      .from('document_versions')
      .insert({
        document_id: doc!.id, business_entity_id: tenant.entityId, version_no: 1,
        storage_path: `${tenant.entityId}/${doc!.id}/v1/gl.csv`, original_filename: 'gl.csv',
        mime_type: 'text/csv', size_bytes: LEDGER_CSV.length, sha256: 'c'.repeat(64), upload_status: 'uploaded',
      })
      .select('id')
      .single();
    const summary = await persistGeneralLedger(
      fx.admin,
      { versionId: version!.id, documentId: doc!.id, entityId: tenant.entityId, currency: 'USD', documentType: 'general_ledger' },
      LEDGER_CSV,
      null,
    );
    const { data: ledger } = await fx.admin.from('general_ledgers').select('id').eq('document_version_id', version!.id).single();
    return { tenant, documentId: doc!.id, ledgerId: ledger!.id, summary };
  }

  // What publishDocument does to a ledger, as the firm admin it runs as.
  async function publish(documentId: string, ledgerId: string) {
    const admin = await firmAdmin();
    const { data: accounts } = await admin.client.from('ledger_accounts').select('id, name').eq('ledger_id', ledgerId);
    const visible = (accounts ?? []).filter((a) => P_AND_L_ACCOUNTS.includes(a.name)).map((a) => a.id);
    await admin.client.from('ledger_accounts').update({ client_visible: true }).in('id', visible);
    const now = new Date().toISOString();
    const { data: published, error } = await admin.client
      .from('general_ledgers')
      .update({ status: 'published', published_at: now, published_by: admin.userId })
      .eq('id', ledgerId)
      .select('id');
    expect(error).toBeNull();
    expect(published).toHaveLength(1);
    await admin.client.from('documents').update({ status: 'published', published_at: now, published_by: admin.userId }).eq('id', documentId);
  }

  test('the worker stores every account and transaction, adding up, and dates the document', async () => {
    const { tenant, documentId, ledgerId, summary } = await ledgerFor('gl-store');
    expect(summary.passed).toBe(true);
    const { data: ledger } = await fx.admin.from('general_ledgers').select('period_start, period_end, basis, status').eq('id', ledgerId).single();
    expect(ledger).toEqual({ period_start: '2026-09-01', period_end: '2026-09-30', basis: 'accrual', status: 'reconciled' });
    const { data: accounts } = await fx.admin.from('ledger_accounts').select('name, total, transaction_count, parent_id').eq('ledger_id', ledgerId).order('position');
    expect(accounts?.map((a) => a.name)).toHaveLength(7);
    expect(accounts?.find((a) => a.name === '6300 - Utilities')).toMatchObject({ total: 640.4, transaction_count: 0 });
    expect(accounts?.find((a) => a.name === '63001 - Electricity')?.parent_id).not.toBeNull();
    const { count } = await fx.admin.from('ledger_transactions').select('id', { count: 'exact', head: true }).eq('ledger_id', ledgerId);
    expect(count).toBe(11);
    const { data: doc } = await fx.admin.from('documents').select('period_start, period_end').eq('id', documentId).single();
    expect(doc).toEqual({ period_start: '2026-09-01', period_end: '2026-09-30' });
    expect(tenant.entityId).toBeTruthy();
  });

  test('a client reads nothing of a ledger the firm has not published', async () => {
    const { tenant, ledgerId } = await ledgerFor('gl-draft');
    const [ledgers, accounts, txns] = await Promise.all([
      tenant.client.from('general_ledgers').select('id').eq('id', ledgerId),
      tenant.client.from('ledger_accounts').select('id').eq('ledger_id', ledgerId),
      tenant.client.from('ledger_transactions').select('id').eq('ledger_id', ledgerId),
    ]);
    expect([ledgers.data, accounts.data, txns.data]).toEqual([[], [], []]);
  });

  test('once published, the client reads the P&L accounts and their transactions only — not the file', async () => {
    const { tenant, documentId, ledgerId } = await ledgerFor('gl-pub');
    await publish(documentId, ledgerId);

    const { data: ledgers } = await tenant.client.from('general_ledgers').select('id').eq('id', ledgerId);
    expect(ledgers).toHaveLength(1);
    const { data: accounts } = await tenant.client.from('ledger_accounts').select('id, name').eq('ledger_id', ledgerId);
    expect(accounts?.map((a) => a.name).sort()).toEqual([...P_AND_L_ACCOUNTS].sort());
    const { data: txns } = await tenant.client.from('ledger_transactions').select('account_id').eq('ledger_id', ledgerId);
    const visible = new Set((accounts ?? []).map((a) => a.id));
    expect(txns).toHaveLength(6);
    expect((txns ?? []).every((t) => visible.has(t.account_id))).toBe(true);

    // The CSV is a working paper (0025, 0026): the client has no row for it.
    const { data: docs } = await tenant.client.from('documents').select('id').eq('id', documentId);
    expect(docs).toEqual([]);
  });

  test('another business reads none of it', async () => {
    const { documentId, ledgerId } = await ledgerFor('gl-owner');
    await publish(documentId, ledgerId);
    const stranger = await fx.makeTenant('gl-stranger');
    const [ledgers, accounts, txns] = await Promise.all([
      stranger.client.from('general_ledgers').select('id').eq('id', ledgerId),
      stranger.client.from('ledger_accounts').select('id').eq('ledger_id', ledgerId),
      stranger.client.from('ledger_transactions').select('id').eq('ledger_id', ledgerId),
    ]);
    expect([ledgers.data, accounts.data, txns.data]).toEqual([[], [], []]);
  });

  test('one published ledger per month, and a published one cannot be deleted from under the client', async () => {
    const { tenant, documentId, ledgerId } = await ledgerFor('gl-once');
    await publish(documentId, ledgerId);
    const second = await fx.admin.from('general_ledgers').insert({
      business_entity_id: tenant.entityId, period_start: '2026-09-01', period_end: '2026-09-30',
      status: 'published', published_at: new Date().toISOString(),
    });
    expect(second.error?.code).toBe('23505');
    // The document guard (0020 → 0026) refuses while published figures derive from it.
    const removal = await fx.admin.from('documents').delete().eq('id', documentId);
    expect(removal.error?.code).toBe('23503');
  });
});
