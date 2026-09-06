// @vitest-environment node
import { afterAll, describe, expect, it } from 'vitest';

import { publishBlockers } from '@/lib/documents/publish';
import { syncDocumentStatus } from '@/lib/documents/recompute';
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

  it('treats a tax filing as data to publish, and gates it on its own reconciliation', async () => {
    // A sales-tax return produces neither a financial_report nor a
    // bank_statement, so publishBlockers saw a document with nothing in it and
    // reported publishBlockedNoData — the firm could never publish one, which
    // is why the client's Taxes pages could only ever show seed data.
    const tenant = await fx.makeTenant('pb-tax');
    const be = { business_entity_id: tenant.entityId };
    const doc = await A.from('documents')
      .insert({ ...be, document_type: 'sales_tax_filing', title: 'DR-15', status: 'reconciled' })
      .select('id')
      .single();
    if (doc.error) throw new Error(`document: ${doc.error.message}`);
    const version = await A.from('document_versions')
      .insert({
        ...be,
        document_id: doc.data.id,
        version_no: 1,
        storage_path: `${tenant.entityId}/${doc.data.id}/v1/dr15.pdf`,
        original_filename: 'dr15.pdf',
        mime_type: 'application/pdf',
        size_bytes: 512,
        upload_status: 'uploaded',
      })
      .select('id')
      .single();
    if (version.error) throw new Error(`version: ${version.error.message}`);
    await A.from('documents').update({ current_version_id: version.data.id }).eq('id', doc.data.id);

    const obligation = {
      ...be,
      tax_type: 'sales' as const,
      source: 'firm_document' as const,
      document_version_id: version.data.id,
    };
    const unreconciled = await A.from('tax_obligations')
      .insert({ ...obligation, reconciliation: failed })
      .select('id')
      .single();
    if (unreconciled.error) throw new Error(`obligation: ${unreconciled.error.message}`);

    const blocked = await publishBlockers(A, doc.data.id);
    expect(blocked.blockers).not.toContain('publishBlockedNoData');
    expect(blocked.blockers).toContain('publishBlockedReconciliation');

    await A.from('tax_obligations')
      .update({ reconciliation: passed })
      .eq('id', unreconciled.data.id);
    const clear = await publishBlockers(A, doc.data.id);
    expect(clear.blockers).toEqual([]);
  });

  it('reviews the newest uploaded version, not the one the client is seeing', async () => {
    // Replacing a published document was a dead end: current_version_id is the
    // publication pointer and deliberately does not move while published, and
    // the review target was derived from it — so v2 uploaded, processed, and
    // was unreachable while the reviewer corrected and re-published v1.
    const tenant = await fx.makeTenant('pb-v2');
    const be = { business_entity_id: tenant.entityId };
    const doc = await A.from('documents')
      .insert({
        ...be,
        document_type: 'profit_and_loss',
        title: 'P&L',
        status: 'published',
        published_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    if (doc.error || !doc.data) throw new Error(`document: ${doc.error?.message}`);
    const documentId = doc.data.id;

    async function addVersion(no: number, reconciliation: Json): Promise<string> {
      const v = await A.from('document_versions')
        .insert({
          ...be,
          document_id: documentId,
          version_no: no,
          storage_path: `${tenant.entityId}/${documentId}/v${no}/p.pdf`,
          original_filename: 'p.pdf',
          mime_type: 'application/pdf',
          size_bytes: 10,
          upload_status: 'uploaded',
        })
        .select('id')
        .single();
      if (v.error) throw new Error(`version ${no}: ${v.error.message}`);
      const r = await A.from('financial_reports').insert({
        ...be,
        report_type: 'profit_and_loss',
        source: 'firm_document',
        document_version_id: v.data.id,
        reconciliation,
        ...PERIOD,
      });
      if (r.error) throw new Error(`report ${no}: ${r.error.message}`);
      return v.data.id;
    }

    const v1 = await addVersion(1, passed);
    await A.from('documents').update({ current_version_id: v1 }).eq('id', documentId);
    const v2 = await addVersion(2, failed);

    // The client still sees v1; review must be looking at v2, and its failed
    // reconciliation must block the republish.
    const { versionId, blockers } = await publishBlockers(A, documentId);
    expect(versionId).toBe(v2);
    expect(versionId).not.toBe(v1);
    expect(blockers).toContain('publishBlockedReconciliation');
  });

  it('lifts a corrected point-of-sale report out of review, so it can be published', async () => {
    // The bug this covers: the worker leaves a document in `needs_review`, the
    // firm corrects the figures until every check passes — and the document
    // stayed in review, because the status sync counted only reports and bank
    // statements. Nothing was left to fix and the Publish button never came
    // back. Found on a real August register report.
    const tenant = await fx.makeTenant('pb-sales-sync');
    const be = { business_entity_id: tenant.entityId };
    const doc = await A.from('documents')
      .insert({
        ...be,
        document_type: 'sales_report',
        title: 'August register',
        status: 'needs_review',
      })
      .select('id')
      .single();
    if (doc.error) throw new Error(`document: ${doc.error.message}`);
    const version = await A.from('document_versions')
      .insert({
        ...be,
        document_id: doc.data.id,
        version_no: 1,
        storage_path: `${tenant.entityId}/${doc.data.id}/v1/register.pdf`,
        original_filename: 'register.pdf',
        mime_type: 'application/pdf',
        size_bytes: 256,
        upload_status: 'uploaded',
      })
      .select('id')
      .single();
    if (version.error) throw new Error(`version: ${version.error.message}`);
    await A.from('documents').update({ current_version_id: version.data.id }).eq('id', doc.data.id);

    const report = await A.from('sales_reports')
      .insert({
        ...be,
        source: 'firm_document',
        source_system: 'other',
        document_version_id: version.data.id,
        reconciliation: failed,
        ...PERIOD,
      })
      .select('id')
      .single();
    if (report.error) throw new Error(`sales report: ${report.error.message}`);

    await syncDocumentStatus(A, version.data.id);
    const stillInReview = await A.from('documents').select('status').eq('id', doc.data.id).single();
    expect(stillInReview.data?.status).toBe('needs_review');
    expect((await publishBlockers(A, doc.data.id)).blockers).toContain('publishBlockedStatus');

    // The correction: the figures now tie.
    await A.from('sales_reports').update({ reconciliation: passed }).eq('id', report.data.id);
    await syncDocumentStatus(A, version.data.id);

    const lifted = await A.from('documents').select('status').eq('id', doc.data.id).single();
    expect(lifted.data?.status).toBe('reconciled');
    expect((await publishBlockers(A, doc.data.id)).blockers).toEqual([]);
  });

  it('syncs the status of the version under review, not an older one', async () => {
    // current_version_id is the publication pointer and does not move while a
    // document is published, so matching the document on it meant a correction
    // to v2 synced nothing at all.
    const tenant = await fx.makeTenant('pb-sync-v2');
    const be = { business_entity_id: tenant.entityId };
    const doc = await A.from('documents')
      .insert({ ...be, document_type: 'profit_and_loss', title: 'P&L', status: 'needs_review' })
      .select('id')
      .single();
    if (doc.error) throw new Error(`document: ${doc.error.message}`);
    const documentId = doc.data.id;

    async function addVersion(no: number, reconciliation: Json): Promise<string> {
      const v = await A.from('document_versions')
        .insert({
          ...be,
          document_id: documentId,
          version_no: no,
          storage_path: `${tenant.entityId}/${documentId}/v${no}/p.pdf`,
          original_filename: 'p.pdf',
          mime_type: 'application/pdf',
          size_bytes: 10,
          upload_status: 'uploaded',
        })
        .select('id')
        .single();
      if (v.error) throw new Error(`version ${no}: ${v.error.message}`);
      const r = await A.from('financial_reports').insert({
        ...be,
        report_type: 'profit_and_loss',
        source: 'firm_document',
        document_version_id: v.data.id,
        reconciliation,
        ...PERIOD,
      });
      if (r.error) throw new Error(`report ${no}: ${r.error.message}`);
      return v.data.id;
    }

    const v1 = await addVersion(1, passed);
    await A.from('documents').update({ current_version_id: v1 }).eq('id', documentId);
    const v2 = await addVersion(2, failed);

    // v1 passes, but the client is not getting v1 — v2 is what review is on.
    await syncDocumentStatus(A, v1);
    const untouched = await A.from('documents').select('status').eq('id', documentId).single();
    expect(untouched.data?.status).toBe('needs_review');

    await A.from('financial_reports')
      .update({ reconciliation: passed })
      .eq('document_version_id', v2);
    await syncDocumentStatus(A, v2);
    const synced = await A.from('documents').select('status').eq('id', documentId).single();
    expect(synced.data?.status).toBe('reconciled');
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
