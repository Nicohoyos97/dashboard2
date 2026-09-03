// @vitest-environment node
import { createHash } from 'node:crypto';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { parseReconciliation } from '@/lib/documents/reconciliation';
import { splitPages } from '@/lib/ingestion/pdf';
import { runPendingJobs } from '@/lib/ingestion/worker';

import { Fixtures, supabaseEnv } from '../e2e/helpers/fixtures';
import {
  type JsonRecord,
  isRecord,
  messageJson,
  mockMessages,
  readExpected,
  readFixture,
  server,
} from '../unit/ingestion/helpers/anthropic-mock';

// The worker end to end against local Supabase with Anthropic mocked at the
// HTTP layer (spec §11 integration, acceptance §14.4 / §14.17 / §14.18):
// fixture PDFs go through storage → claim → classify → extract → persist,
// and the resulting rows carry exactly the checks the review UI relies on.
const env = supabaseEnv();
const FIXTURES = ['letter-and-pnl', 'balance-sheet', 'balance-sheet-unbalanced', 'bank-statement'] as const;
type FixtureName = (typeof FIXTURES)[number];

const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');

// Every request carries the single-page PDFs the pipeline split; hashing them
// tells the mock which fixture (and which pages) it is looking at.
async function pageIndex(): Promise<Map<string, { fixture: FixtureName; page: number }>> {
  const index = new Map<string, { fixture: FixtureName; page: number }>();
  for (const fixture of FIXTURES) {
    const pages = await splitPages(readFixture(`${fixture}.pdf`));
    pages.forEach((pdf, i) => index.set(sha(pdf), { fixture, page: i + 1 }));
  }
  return index;
}

function documentHashes(body: JsonRecord): string[] {
  const messages = body.messages;
  const first = Array.isArray(messages) ? messages[0] : undefined;
  const content = isRecord(first) && Array.isArray(first.content) ? first.content : [];
  return content.flatMap((block: unknown) => {
    if (!isRecord(block) || block.type !== 'document' || !isRecord(block.source)) return [];
    return typeof block.source.data === 'string' ? [sha(Buffer.from(block.source.data, 'base64'))] : [];
  });
}

function isClassificationRequest(body: JsonRecord): boolean {
  const format = isRecord(body.output_config) && isRecord(body.output_config.format) ? body.output_config.format : null;
  const schema = format && isRecord(format.schema) ? format.schema : null;
  const props = schema && isRecord(schema.properties) ? schema.properties : null;
  return props !== null && 'pages' in props;
}

describe.skipIf(!env)('worker integration', () => {
  const fx = new Fixtures();
  let index: Map<string, { fixture: FixtureName; page: number }>;
  const uploaded: string[] = [];

  beforeAll(async () => {
    index = await pageIndex();
    server.listen({ onUnhandledRequest: 'bypass' }); // Supabase traffic passes through
  });
  // A runtime handler per test: msw drops them on reset, and a job that
  // slipped past the mock would hit the real API with a fake model id.
  beforeEach(() => {
    server.resetHandlers();
    mockMessages((body) => {
      const hashes = documentHashes(body);
      const hit = hashes.map((h) => index.get(h)).find((h) => h !== undefined);
      if (!hit) throw new Error('mock: unknown document in request');
      if (isClassificationRequest(body)) {
        const expected = readExpected(`${hit.fixture}.classification.json`) as { pages: Array<{ page: number }> };
        const sent = new Set(hashes.map((h) => index.get(h)?.page));
        return messageJson({ pages: expected.pages.filter((p) => sent.has(p.page)) });
      }
      return messageJson(readExpected(`${hit.fixture}.json`));
    });
  });
  afterAll(async () => {
    server.close();
    if (uploaded.length) await fx.admin.storage.from('documents').remove(uploaded);
    await fx.cleanup();
  });

  async function seed(entityId: string, fixture: FixtureName, documentType: string) {
    const pdf = readFixture(`${fixture}.pdf`);
    const { data: doc } = await fx.admin
      .from('documents')
      .insert({ business_entity_id: entityId, document_type: documentType, title: fixture, status: 'uploaded' })
      .select('id')
      .single();
    const path = `${entityId}/${doc!.id}/v1/${fixture}.pdf`;
    const { error: upErr } = await fx.admin.storage.from('documents').upload(path, pdf, { contentType: 'application/pdf' });
    if (upErr) throw new Error(`upload: ${upErr.message}`);
    uploaded.push(path);
    const { data: version } = await fx.admin
      .from('document_versions')
      .insert({
        document_id: doc!.id,
        business_entity_id: entityId,
        version_no: 1,
        storage_path: path,
        original_filename: `${fixture}.pdf`,
        mime_type: 'application/pdf',
        size_bytes: pdf.length,
        sha256: sha(pdf),
        page_count: (await splitPages(pdf)).length,
        upload_status: 'uploaded',
      })
      .select('id')
      .single();
    await fx.admin.from('documents').update({ current_version_id: version!.id }).eq('id', doc!.id);
    await fx.admin.from('document_processing_jobs').insert({ business_entity_id: entityId, document_version_id: version!.id });
    return { documentId: doc!.id, versionId: version!.id };
  }

  it('processes a combined letter + P&L: letter skipped, statement extracted, reconciled', async () => {
    const entityId = await fx.makeEntity(await fx.makeClientRow('wk-pnl'), 'Worker P&L Co');
    const { documentId, versionId } = await seed(entityId, 'letter-and-pnl', 'statement_package');

    const summary = await runPendingJobs({ batchSize: 5 });
    expect(summary.outcomes.find((o) => o.status !== 'succeeded')).toBeUndefined();

    const { data: pages } = await fx.admin.from('document_pages').select('page_number, kind').eq('document_version_id', versionId).order('page_number');
    expect(pages?.map((p) => p.kind)).toEqual(['firm_letter', 'financial_statement', 'financial_statement']);

    const { data: reports } = await fx.admin.from('financial_reports').select('id, report_type, status, reconciliation, period_start, period_end').eq('document_version_id', versionId);
    expect(reports).toHaveLength(1);
    const report = reports![0]!;
    expect(report.report_type).toBe('profit_and_loss');
    expect(parseReconciliation(report.reconciliation)?.passed).toBe(true);
    expect(report.status).toBe('reconciled');

    const { data: lines } = await fx.admin.from('financial_statement_lines').select('page_number, parent_line_id, is_total').eq('report_id', report.id);
    expect((lines ?? []).length).toBeGreaterThan(10);
    // Extraction only ever used statement pages (never the letter on page 1).
    expect((lines ?? []).every((l) => (l.page_number ?? 0) >= 2)).toBe(true);
    expect((lines ?? []).some((l) => l.parent_line_id !== null)).toBe(true);

    const { data: doc } = await fx.admin.from('documents').select('status, document_type, period_start, period_end').eq('id', documentId).single();
    expect(doc).toMatchObject({ status: 'reconciled', document_type: 'profit_and_loss', period_start: report.period_start, period_end: report.period_end });
  });

  it('an unbalanced balance sheet lands in review, a balanced one reconciles', async () => {
    const entityId = await fx.makeEntity(await fx.makeClientRow('wk-bs'), 'Worker BS Co');
    const bad = await seed(entityId, 'balance-sheet-unbalanced', 'balance_sheet');
    const good = await seed(entityId, 'balance-sheet', 'balance_sheet');
    await runPendingJobs({ batchSize: 5 });

    const { data: badReport } = await fx.admin.from('financial_reports').select('status, reconciliation').eq('document_version_id', bad.versionId).single();
    const badRec = parseReconciliation(badReport?.reconciliation);
    expect(badRec?.passed).toBe(false);
    expect(badRec?.checks.some((c) => c.key === 'balance_equation' && !c.ok)).toBe(true);
    expect(badReport?.status).toBe('needs_review');
    const { data: badDoc } = await fx.admin.from('documents').select('status').eq('id', bad.documentId).single();
    expect(badDoc?.status).toBe('needs_review');

    const { data: goodReport } = await fx.admin.from('financial_reports').select('status').eq('document_version_id', good.versionId).single();
    expect(goodReport?.status).toBe('reconciled');
  });

  it('a bank statement becomes an account, a statement and its transactions', async () => {
    const entityId = await fx.makeEntity(await fx.makeClientRow('wk-bank'), 'Worker Bank Co');
    const { versionId, documentId } = await seed(entityId, 'bank-statement', 'bank_statement');
    await runPendingJobs({ batchSize: 5 });

    const { data: statements } = await fx.admin.from('bank_statements').select('id, status, reconciliation, bank_accounts ( masked_number )').eq('document_version_id', versionId);
    expect(statements).toHaveLength(1);
    const statement = statements![0]!;
    expect(parseReconciliation(statement.reconciliation)?.passed).toBe(true);
    expect((statement.bank_accounts?.masked_number.match(/\d/g) ?? []).length).toBeLessThanOrEqual(4);

    const expected = readExpected('bank-statement.json') as { transactions: unknown[] };
    const { count } = await fx.admin.from('bank_transactions').select('id', { count: 'exact', head: true }).eq('bank_statement_id', statement.id);
    expect(count).toBe(expected.transactions.length);

    const { data: doc } = await fx.admin.from('documents').select('status').eq('id', documentId).single();
    expect(doc?.status).toBe('reconciled');

    // Re-running the same version is idempotent (no duplicated transactions).
    await fx.admin.from('document_processing_jobs').insert({ business_entity_id: entityId, document_version_id: versionId });
    await runPendingJobs({ batchSize: 5 });
    const { count: again } = await fx.admin.from('bank_transactions').select('id', { count: 'exact', head: true }).eq('business_entity_id', entityId);
    expect(again).toBe(expected.transactions.length);
  });
});
