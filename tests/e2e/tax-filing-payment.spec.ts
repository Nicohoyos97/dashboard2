import { expect, test } from '@playwright/test';

import { clearDerived, persistPipelineOutput } from '@/lib/ingestion/persist';
import type { PipelineOutput } from '@/lib/ingestion/pipeline';
import { ZERO_USAGE } from '@/lib/ingestion/request';
import type { TaxRecord } from '@/lib/ingestion/schemas/tax-record';

import { Fixtures, supabaseEnv } from './helpers/fixtures';

// A sales-tax return and the payment confirmation for the same month write
// one obligation, each its own half — decided by the type chosen at upload
// (lib/ingestion/tax-roles.ts). Before that, both wrote everything: the one
// processed last claimed the row, the return read "nothing was extracted" and
// could not be published, and the confirmation's blanks replaced the amount
// owed and the due date. Figures are invented.
const PERIOD = { filing_period_start: '2026-08-01', filing_period_end: '2026-08-31' };

// What an ST-1 reads as, including the part that misled: a confirmation
// number and a status the model could take for paid.
const RETURN: TaxRecord = {
  tax_type: 'sales',
  jurisdiction: 'Illinois Department of Revenue',
  ...PERIOD,
  due_date: '2026-09-21',
  amount_payable: '1000.00',
  confirmation_number: '1-000-000-000',
  status: 'paid',
  page: 1,
  confidence: 0.97,
};

const CONFIRMATION: TaxRecord = {
  tax_type: 'sales',
  jurisdiction: 'Illinois Department of Revenue',
  ...PERIOD,
  amount_paid: '1000.00',
  payment_date: '2026-09-20',
  confirmation_number: 'ACH-0001',
  status: 'paid',
  page: 1,
  confidence: 0.96,
};

function output(record: TaxRecord): PipelineOutput {
  return {
    pageCount: 1,
    pages: [],
    usage: ZERO_USAGE,
    warnings: [],
    results: [
      { kind: 'tax_record', data: record, reconciliation: { passed: true, checks: [], lowConfidence: { count: 0, refs: [] } }, pages: [1] },
    ],
  };
}

test.describe('a sales-tax return and its payment confirmation', () => {
  test.skip(!supabaseEnv(), 'Supabase env not available');

  const fx = new Fixtures();
  test.afterAll(() => fx.cleanup());

  async function makeDocument(entityId: string, documentType: string) {
    const { data: doc } = await fx.admin
      .from('documents')
      .insert({ business_entity_id: entityId, document_type: documentType, title: documentType, status: 'reconciled' })
      .select('id')
      .single();
    const { data: version } = await fx.admin
      .from('document_versions')
      .insert({
        document_id: doc!.id, business_entity_id: entityId, version_no: 1,
        storage_path: `${entityId}/${doc!.id}/v1/doc.pdf`, original_filename: 'doc.pdf',
        mime_type: 'application/pdf', size_bytes: 10, sha256: (documentType === 'sales_tax_filing' ? 'c' : 'd').repeat(64), upload_status: 'uploaded',
      })
      .select('id')
      .single();
    await fx.admin.from('documents').update({ current_version_id: version!.id }).eq('id', doc!.id);
    return { documentId: doc!.id, versionId: version!.id, documentType };
  }

  async function persist(entityId: string, doc: Awaited<ReturnType<typeof makeDocument>>, record: TaxRecord) {
    const ctx = { versionId: doc.versionId, documentId: doc.documentId, entityId, currency: 'USD', documentType: doc.documentType };
    await clearDerived(fx.admin as never, doc.versionId);
    await persistPipelineOutput(fx.admin as never, ctx, output(record));
  }

  async function obligation(entityId: string) {
    const { data } = await fx.admin
      .from('tax_obligations')
      .select('id, document_version_id, amount_payable, amount_paid, due_date, status')
      .eq('business_entity_id', entityId);
    expect(data ?? [], 'one obligation for the period').toHaveLength(1);
    return data![0]!;
  }

  async function setup(label: string) {
    const entityId = await fx.makeEntity(await fx.makeClientRow(label), `${label} Co`);
    return {
      entityId,
      filing: await makeDocument(entityId, 'sales_tax_filing'),
      payment: await makeDocument(entityId, 'sales_tax_payment'),
    };
  }

  for (const order of ['return first', 'confirmation first'] as const) {
    test(`each keeps its own half, ${order}`, async () => {
      const { entityId, filing, payment } = await setup(`taxpair${order === 'return first' ? 'a' : 'b'}`);
      if (order === 'return first') {
        await persist(entityId, filing, RETURN);
        await persist(entityId, payment, CONFIRMATION);
      } else {
        await persist(entityId, payment, CONFIRMATION);
        await persist(entityId, filing, RETURN);
      }

      const row = await obligation(entityId);
      expect(row.document_version_id, 'the return keeps the pointer').toBe(filing.versionId);
      expect(Number(row.amount_payable), 'the confirmation does not blank what was owed').toBe(1000);
      expect(row.due_date).toBe('2026-09-21');
      expect(Number(row.amount_paid)).toBe(1000);
      expect(row.status, 'the confirmation settles it; the return never downgrades it').toBe('paid');

      const { data: payments } = await fx.admin.from('tax_payments').select('document_version_id').eq('obligation_id', row.id);
      expect(payments ?? [], 'the return records no payment of its own').toEqual([{ document_version_id: payment.versionId }]);

      // Neither is left with "nothing was extracted": the return owns the
      // obligation (asserted above), the confirmation owns its payment — the
      // two kinds of row publishBlockers counts for each (lib/documents/publish.ts,
      // which is server-only and cannot be imported here).
      const { data: reconciliation } = await fx.admin.from('tax_obligations').select('reconciliation').eq('id', row.id).single();
      expect((reconciliation!.reconciliation as { passed?: boolean }).passed).toBe(true);
    });
  }

  test('a return alone is payable, never paid, and records no payment', async () => {
    const { entityId, filing } = await setup('taxalone');
    await persist(entityId, filing, RETURN);
    const row = await obligation(entityId);
    expect(row.status).toBe('payable');
    expect(row.amount_paid).toBeNull();
    const { count } = await fx.admin.from('tax_payments').select('id', { count: 'exact', head: true }).eq('obligation_id', row.id);
    expect(count).toBe(0);
  });

  test('reprocessing either one leaves the other half, and no payment is stacked', async () => {
    const { entityId, filing, payment } = await setup('taxreproc');
    await persist(entityId, filing, RETURN);
    await persist(entityId, payment, CONFIRMATION);

    // The return again: the paid row survives with its payment.
    await persist(entityId, filing, RETURN);
    // The confirmation again: its own payment is replaced, not stacked.
    await persist(entityId, payment, CONFIRMATION);

    const row = await obligation(entityId);
    expect(row.document_version_id).toBe(filing.versionId);
    expect(Number(row.amount_payable)).toBe(1000);
    expect(row.status).toBe('paid');
    const { count } = await fx.admin.from('tax_payments').select('id', { count: 'exact', head: true }).eq('obligation_id', row.id);
    expect(count).toBe(1);
  });
});
