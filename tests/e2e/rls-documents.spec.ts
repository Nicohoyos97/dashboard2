import { createHash } from 'node:crypto';

import { expect, test } from '@playwright/test';

import { type Db, Fixtures, elevateToAal2, insertDenied, supabaseEnv } from './helpers/fixtures';

// Documents, versions, page classification, the processing queue and the
// private `documents` bucket (0003_documents.sql). The rule under test: a
// member sees a document only once it is PUBLISHED, and then only its current
// version — never drafts, never superseded versions, never the worker's
// per-page classification or the queue. The firm (aal2) sees everything; only
// the service role claims jobs. Storage mirrors the table policies.
const PDF = Buffer.from('%PDF-1.4\n%test\n');
const PDF_OPTS = { contentType: 'application/pdf' };
const FAR_FUTURE = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

type Seeded = { docId: string; versionId: string; path: string; jobId: string };

test.describe('RLS documents and storage', () => {
  test.skip(!supabaseEnv(), 'Supabase env not available');

  const fx = new Fixtures();
  const uploaded: string[] = [];
  test.afterAll(async () => {
    // Storage objects do not cascade with the tenant rows.
    if (uploaded.length) await fx.admin.storage.from('documents').remove(uploaded);
    await fx.cleanup();
  });

  // A draft P&L for `entityId`: one version (bytes uploaded), one classified
  // page, one queued job. Jobs are scheduled far in the future unless
  // `claimable`, so parallel tests never claim each other's queue rows.
  async function seedDocument(entityId: string, claimable = false): Promise<Seeded> {
    const doc = await fx.admin
      .from('documents')
      .insert({
        business_entity_id: entityId,
        document_type: 'profit_and_loss',
        title: 'P&L Jan 2026',
        status: 'needs_review',
      })
      .select('id')
      .single();
    if (doc.error || !doc.data) throw new Error(`seed document: ${doc.error?.message}`);
    const path = `${entityId}/${doc.data.id}/v1/report.pdf`;
    const version = await fx.admin
      .from('document_versions')
      .insert({
        document_id: doc.data.id,
        business_entity_id: entityId,
        version_no: 1,
        storage_path: path,
        original_filename: 'report.pdf',
        mime_type: 'application/pdf',
        size_bytes: PDF.length,
        sha256: createHash('sha256').update(PDF).digest('hex'),
        upload_status: 'uploaded',
      })
      .select('id')
      .single();
    if (version.error || !version.data) throw new Error(`seed version: ${version.error?.message}`);
    await fx.admin
      .from('documents')
      .update({ current_version_id: version.data.id })
      .eq('id', doc.data.id);
    const page = await fx.admin.from('document_pages').insert({
      document_version_id: version.data.id,
      business_entity_id: entityId,
      page_number: 1,
      kind: 'financial_statement',
    });
    if (page.error) throw new Error(`seed page: ${page.error.message}`);
    const job = await fx.admin
      .from('document_processing_jobs')
      .insert({
        business_entity_id: entityId,
        document_version_id: version.data.id,
        run_after: claimable ? new Date().toISOString() : FAR_FUTURE,
      })
      .select('id')
      .single();
    if (job.error || !job.data) throw new Error(`seed job: ${job.error?.message}`);
    uploaded.push(path);
    const up = await fx.admin.storage.from('documents').upload(path, PDF, PDF_OPTS);
    if (up.error) throw new Error(`seed upload: ${up.error.message}`);
    return { docId: doc.data.id, versionId: version.data.id, path, jobId: job.data.id };
  }

  async function publish(docId: string): Promise<void> {
    const r = await fx.admin
      .from('documents')
      .update({ status: 'published', published_at: new Date().toISOString() })
      .eq('id', docId);
    if (r.error) throw new Error(`publish: ${r.error.message}`);
  }

  test('members see a document only once published, and only its current version', async () => {
    const a = await fx.makeTenant('da');
    const b = await fx.makeTenant('db');
    const admin = await fx.makeFirmUser('d-admin');
    await elevateToAal2(admin.client);
    const s = await seedDocument(b.entityId);

    const docs = (db: Db) => db.from('documents').select('id').eq('id', s.docId);
    const versions = (db: Db) =>
      db.from('document_versions').select('id').eq('document_id', s.docId);
    const pages = (db: Db) =>
      db.from('document_pages').select('id').eq('document_version_id', s.versionId);
    const jobs = (db: Db) =>
      db.from('document_processing_jobs').select('id').eq('document_version_id', s.versionId);

    // Draft: invisible to its own business; the firm sees every table.
    expect((await docs(b.client)).data ?? []).toHaveLength(0);
    expect((await versions(b.client)).data ?? []).toHaveLength(0);
    expect((await docs(a.client)).data ?? []).toHaveLength(0);
    expect((await docs(admin.client)).data).toHaveLength(1);
    expect((await versions(admin.client)).data).toHaveLength(1);
    expect((await pages(admin.client)).data).toHaveLength(1);
    expect((await jobs(admin.client)).data).toHaveLength(1);

    await publish(s.docId);

    // Published: B sees the document and exactly its current version; A still
    // nothing; pages and jobs stay firm-only (clients get type + period only).
    expect((await docs(b.client)).data).toHaveLength(1);
    expect((await versions(b.client)).data?.map((v) => v.id)).toEqual([s.versionId]);
    expect((await docs(a.client)).data ?? []).toHaveLength(0);
    expect((await versions(a.client)).data ?? []).toHaveLength(0);
    expect((await pages(b.client)).data ?? []).toHaveLength(0);
    expect((await jobs(b.client)).data ?? []).toHaveLength(0);

    // A second version that is NOT current stays invisible to B: only the bytes
    // the client may download are ever listed.
    const v2 = await fx.admin.from('document_versions').insert({
      document_id: s.docId,
      business_entity_id: b.entityId,
      version_no: 2,
      storage_path: `${b.entityId}/${s.docId}/v2/report.pdf`,
      original_filename: 'report-v2.pdf',
      mime_type: 'application/pdf',
      size_bytes: PDF.length + 1,
      sha256: createHash('sha256').update(PDF).update('v2').digest('hex'),
      upload_status: 'uploaded',
    });
    expect(v2.error).toBeNull();
    expect((await versions(admin.client)).data).toHaveLength(2);
    expect((await versions(b.client)).data?.map((v) => v.id)).toEqual([s.versionId]);
  });

  test('clients cannot create or edit documents, versions or jobs', async () => {
    const b = await fx.makeTenant('dw');
    const s = await seedDocument(b.entityId);
    await publish(s.docId);

    // Positive control: B reads the published document it is about to attack.
    const own = await b.client.from('documents').select('id').eq('id', s.docId);
    expect(own.data).toHaveLength(1);

    // Every write policy on these tables is is_firm_admin(); a member has none.
    const insDoc = await b.client
      .from('documents')
      .insert({ business_entity_id: b.entityId, document_type: 'other_report', title: 'forged' })
      .select();
    expect(insertDenied(insDoc)).toBe(true);
    const updDoc = await b.client
      .from('documents')
      .update({ title: 'renamed' })
      .eq('id', s.docId)
      .select();
    expect(updDoc.data ?? []).toHaveLength(0);
    const insVersion = await b.client
      .from('document_versions')
      .insert({
        document_id: s.docId,
        business_entity_id: b.entityId,
        version_no: 9,
        storage_path: `${b.entityId}/${s.docId}/v9/forged.pdf`,
        original_filename: 'forged.pdf',
        mime_type: 'application/pdf',
        size_bytes: 1,
      })
      .select();
    expect(insertDenied(insVersion)).toBe(true);
    const insJob = await b.client
      .from('document_processing_jobs')
      .insert({ business_entity_id: b.entityId, document_version_id: s.versionId })
      .select();
    expect(insertDenied(insJob)).toBe(true);

    const title = await fx.admin.from('documents').select('title').eq('id', s.docId).single();
    expect(title.data?.title).toBe('P&L Jan 2026');
  });

  test('claim_processing_jobs is callable by the service role only', async () => {
    const b = await fx.makeTenant('dj');
    const admin = await fx.makeFirmUser('dj-admin');
    await elevateToAal2(admin.client);
    const s = await seedDocument(b.entityId, true);

    // EXECUTE is revoked from authenticated: the member and even the firm admin
    // get a permission error, so nobody can advance the queue through PostgREST.
    const asMember = await b.client.rpc('claim_processing_jobs', { batch_size: 1 });
    expect(asMember.error).not.toBeNull();
    const asFirm = await admin.client.rpc('claim_processing_jobs', { batch_size: 1 });
    expect(asFirm.error).not.toBeNull();

    // Positive control: the worker (service role) claims pending jobs. Other
    // specs may have queued jobs of their own at the same moment, so claim a
    // batch, check ours is in it, and hand the rest straight back.
    const claimed = await fx.admin.rpc('claim_processing_jobs', { batch_size: 50 });
    expect(claimed.error).toBeNull();
    const mine = (claimed.data ?? []).find((j) => j.id === s.jobId);
    expect(mine?.status).toBe('running');
    const others = (claimed.data ?? []).filter((j) => j.id !== s.jobId);
    for (const job of others) {
      await fx.admin
        .from('document_processing_jobs')
        .update({ status: 'pending', locked_at: null, attempts: Math.max(0, job.attempts - 1) })
        .eq('id', job.id);
    }
  });

  test('documents bucket: signed reads follow publication; writes are firm-admin only', async () => {
    const a = await fx.makeTenant('sa');
    const b = await fx.makeTenant('sb');
    const admin = await fx.makeFirmUser('s-admin');
    const aal1Admin = await fx.makeFirmUser('s-admin-aal1');
    await elevateToAal2(admin.client);
    const s = await seedDocument(b.entityId);
    const bucket = (db: Db) => db.storage.from('documents');
    const sign = async (db: Db) => (await bucket(db).createSignedUrl(s.path, 60)).error;

    // Draft: document_object_is_client_visible() is false, and a firm user
    // without TOTP is not a firm member — only the aal2 admin can sign.
    expect(await sign(b.client)).not.toBeNull();
    expect(await sign(a.client)).not.toBeNull();
    expect(await sign(aal1Admin.client)).not.toBeNull();
    expect(await sign(admin.client)).toBeNull();

    await publish(s.docId);

    // Published: B signs and downloads the exact bytes; A and the aal1 admin still cannot.
    const signed = await bucket(b.client).createSignedUrl(s.path, 60);
    expect(signed.error).toBeNull();
    const res = await fetch(signed.data!.signedUrl);
    expect(res.status).toBe(200);
    expect(Buffer.from(await res.arrayBuffer()).equals(PDF)).toBe(true);
    expect(await sign(a.client)).not.toBeNull();
    expect(await sign(aal1Admin.client)).not.toBeNull();

    // Writes: documents_admin_insert is firm admin only. Paths are tracked
    // before the attempt so a failed assertion never leaves objects behind.
    const evilPath = `${b.entityId}/x/v1/evil.pdf`;
    const v3Path = `${b.entityId}/${s.docId}/v3/new.pdf`;
    uploaded.push(evilPath, v3Path);
    const evil = await bucket(b.client).upload(evilPath, PDF, PDF_OPTS);
    expect(evil.error).not.toBeNull();
    const firmUp = await bucket(admin.client).upload(v3Path, PDF, PDF_OPTS);
    expect(firmUp.error).toBeNull();

    // No DELETE policy exists on the bucket: bytes are immutable history.
    const rm = await bucket(b.client).remove([s.path]);
    expect(rm.data ?? []).toHaveLength(0);
    const stillThere = await bucket(fx.admin).download(s.path);
    expect(stillThere.error).toBeNull();
  });
});
