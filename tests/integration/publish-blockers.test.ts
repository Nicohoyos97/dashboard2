// @vitest-environment node
import { afterAll, describe, expect, it } from 'vitest';

import { publishBlockers } from '@/lib/documents/publish';
import type { Json } from '@/lib/supabase/types';

import { Fixtures, supabaseEnv } from '../e2e/helpers/fixtures';

// The server-side half of "unreconciled reports cannot be published"
// (CLAUDE.md rule 10). The browser test proves the Publish button is disabled
// while checks fail; that is UI, and a Server Action is addressable without
// it. These run publishBlockers against a real database so the gate itself is
// load-bearing: before this, deleting the guard left the whole suite green.
const env = supabaseEnv();
const fx = new Fixtures();

describe.skipIf(!env)('publish blockers', () => {
  afterAll(() => fx.cleanup());

  const A = fx.admin;
  const PERIOD = { period_start: '2026-01-01', period_end: '2026-01-31' };
  const lowConfidence = { count: 0, refs: [] };
  const passed = { passed: true, checks: [], lowConfidence };
  const failed = {
    passed: false,
    lowConfidence,
    checks: [
      {
        key: 'ending_balance',
        ok: false,
        expectedCents: 100_00,
        actualCents: 200_00,
        toleranceCents: 1,
        label: 'Beginning balance + credits - debits = ending balance',
      },
    ],
  };

  async function documentWith(
    label: string,
    reconciliation: Json,
    status = 'reconciled',
  ): Promise<string> {
    const tenant = await fx.makeTenant(label);
    const be = { business_entity_id: tenant.entityId };
    const doc = await A.from('documents')
      .insert({ ...be, document_type: 'profit_and_loss', title: 'P&L', status })
      .select('id')
      .single();
    if (doc.error) throw new Error(`document: ${doc.error.message}`);
    const version = await A.from('document_versions')
      .insert({
        ...be,
        document_id: doc.data.id,
        version_no: 1,
        storage_path: `${tenant.entityId}/${doc.data.id}/v1/p-and-l.pdf`,
        original_filename: 'p-and-l.pdf',
        mime_type: 'application/pdf',
        size_bytes: 1024,
        upload_status: 'uploaded',
      })
      .select('id')
      .single();
    if (version.error) throw new Error(`version: ${version.error.message}`);
    const report = await A.from('financial_reports').insert({
      ...be,
      report_type: 'profit_and_loss',
      source: 'firm_document',
      document_version_id: version.data.id,
      reconciliation,
      ...PERIOD,
    });
    if (report.error) throw new Error(`report: ${report.error.message}`);
    const linked = await A.from('documents')
      .update({ current_version_id: version.data.id })
      .eq('id', doc.data.id);
    if (linked.error) throw new Error(`link: ${linked.error.message}`);
    return doc.data.id;
  }

  it('blocks a document whose reconciliation did not pass', async () => {
    const documentId = await documentWith('pb-fail', failed);
    const { blockers } = await publishBlockers(A, documentId);
    expect(blockers).toContain('publishBlockedReconciliation');
  });

  it('blocks a document whose reconciliation column does not parse', async () => {
    // Fail closed: a column the schema cannot read is not evidence of anything,
    // so it must not be treated as a pass.
    const documentId = await documentWith('pb-junk', { passed: true });
    const { blockers } = await publishBlockers(A, documentId);
    expect(blockers).toContain('publishBlockedReconciliation');
  });

  it('blocks a document with no reconciliation recorded at all', async () => {
    // The CSV path writes `passed: false` with no checks; a null column is the
    // other way a report reaches publish without ever having been reconciled.
    const documentId = await documentWith('pb-null', null);
    const { blockers } = await publishBlockers(A, documentId);
    expect(blockers).toContain('publishBlockedReconciliation');
  });

  it('blocks a document that is not in a publishable state', async () => {
    const documentId = await documentWith('pb-state', passed, 'needs_review');
    const { blockers } = await publishBlockers(A, documentId);
    expect(blockers).toContain('publishBlockedStatus');
  });

  it('clears once the document is reconciled and in a publishable state', async () => {
    const documentId = await documentWith('pb-ok', passed);
    const { blockers, versionId, entityId } = await publishBlockers(A, documentId);
    expect(blockers).toEqual([]);
    expect(versionId).not.toBeNull();
    expect(entityId).not.toBeNull();
  });

  it('blocks a document that has no derived rows to publish', async () => {
    const tenant = await fx.makeTenant('pb-empty');
    const doc = await A.from('documents')
      .insert({
        business_entity_id: tenant.entityId,
        document_type: 'other_report',
        title: 'Nothing',
        status: 'reconciled',
      })
      .select('id')
      .single();
    if (doc.error) throw new Error(`document: ${doc.error.message}`);
    const { blockers } = await publishBlockers(A, doc.data.id);
    expect(blockers).toContain('publishBlockedNoData');
  });
});
