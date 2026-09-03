import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { type Browser, type Page, expect, test } from '@playwright/test';

import { buildHierarchy } from '@/lib/ingestion/hierarchy';
import { FinancialStatementSchema } from '@/lib/ingestion/schemas/financial-statement';

import { Fixtures, PASSWORD, supabaseEnv } from './helpers/fixtures';
import { totp } from './helpers/totp';

// Review → correct → reconcile → publish, through the browser (acceptance
// §14.5, §14.7, §14.9, §14.18). The extraction is seeded from the P&L fixture
// with one total tampered and one line at low confidence — exactly what the
// pipeline would hand to the review queue — so the firm has to fix both before
// Publish unlocks; the client can only download once it is published.
test.describe('Firm portal: review, corrections, publish', () => {
  test.skip(!supabaseEnv(), 'Supabase env not available');
  test.setTimeout(120_000);

  const fx = new Fixtures();
  const uploaded: string[] = [];
  test.afterAll(async () => {
    if (uploaded.length) await fx.admin.storage.from('documents').remove(uploaded);
    await fx.cleanup();
  });

  async function signIn(page: Page, email: string): Promise<void> {
    await page.goto('/signin');
    await page.fill('#email', email);
    await page.fill('#password', PASSWORD);
    await page.getByRole('button', { name: /^sign in$/i }).click();
    await expect(page).toHaveURL(/\/dashboard/);
  }

  async function adminPage(browser: Browser): Promise<Page> {
    const firm = await fx.makeFirmUser('rv-admin');
    const page = await (await browser.newContext()).newPage();
    await signIn(page, firm.email);
    await page.goto('/admin');
    const secret = (await page.locator('code').first().textContent())?.trim() ?? '';
    await page.fill('#totp', totp(secret));
    await page.getByRole('button', { name: /activate and continue/i }).click();
    await expect(page).toHaveURL(/\/admin$/);
    return page;
  }

  // Seeds what the worker would have persisted for the P&L fixture, tampered.
  async function seedExtraction(entityId: string) {
    const pdf = readFileSync('tests/fixtures/letter-and-pnl.pdf');
    const statement = FinancialStatementSchema.parse(
      JSON.parse(readFileSync('tests/fixtures/expected/letter-and-pnl.json', 'utf8')),
    );
    const { rows } = buildHierarchy(statement.lines);

    const { data: doc } = await fx.admin
      .from('documents')
      .insert({ business_entity_id: entityId, document_type: 'profit_and_loss', title: 'P&L Jan–Jun 2026', status: 'needs_review', period_start: statement.period_start, period_end: statement.period_end })
      .select('id')
      .single();
    const path = `${entityId}/${doc!.id}/v1/letter-and-pnl.pdf`;
    await fx.admin.storage.from('documents').upload(path, pdf, { contentType: 'application/pdf' });
    uploaded.push(path);
    const { data: version } = await fx.admin
      .from('document_versions')
      .insert({ document_id: doc!.id, business_entity_id: entityId, version_no: 1, storage_path: path, original_filename: 'letter-and-pnl.pdf', mime_type: 'application/pdf', size_bytes: pdf.length, sha256: randomUUID().replace(/-/g, ''), page_count: 3, upload_status: 'uploaded' })
      .select('id')
      .single();
    await fx.admin.from('documents').update({ current_version_id: version!.id }).eq('id', doc!.id);

    const { data: report } = await fx.admin
      .from('financial_reports')
      .insert({ business_entity_id: entityId, report_type: 'profit_and_loss', basis: statement.basis ?? null, currency: statement.currency, period_start: statement.period_start, period_end: statement.period_end, source: 'firm_document', document_version_id: version!.id, status: 'needs_review', reconciliation: { passed: false, checks: [], lowConfidence: { count: 1, refs: [] } } })
      .select('id')
      .single();

    // Tamper: the first printed total is off by $50; the first plain line is low-confidence.
    const tamperedIndex = rows.findIndex((r) => r.is_total && r.currentCents !== null);
    const lowIndex = rows.findIndex((r) => !r.is_total && !r.is_section && r.currentCents !== null);
    const ids = rows.map(() => randomUUID());
    await fx.admin.from('financial_statement_lines').insert(
      rows.map((r, i) => ({
        id: ids[i]!,
        report_id: report!.id,
        business_entity_id: entityId,
        parent_line_id: r.parentIndex === null ? null : ids[r.parentIndex]!,
        position: r.position,
        depth: r.depth,
        section: r.section,
        account_name: r.account_name,
        current: r.currentCents === null ? null : (r.currentCents + (i === tamperedIndex ? 5000 : 0)) / 100,
        prior: r.priorCents === null ? null : r.priorCents / 100,
        is_section: r.is_section,
        is_total: r.is_total,
        page_number: r.page,
        source_text: r.source_text,
        confidence: i === lowIndex ? 0.5 : r.confidence,
        source: 'firm_document',
        document_version_id: version!.id,
      })),
    );
    const tampered = rows[tamperedIndex]!;
    const low = rows[lowIndex]!;
    return {
      documentId: doc!.id,
      versionId: version!.id,
      tampered: { name: tampered.account_name, correct: (tampered.currentCents! / 100).toFixed(2) },
      low: { name: low.account_name, value: (low.currentCents! / 100).toFixed(2) },
    };
  }

  test('corrections unlock publish; client visibility follows publication', async ({ browser }) => {
    const entityId = await fx.makeEntity(await fx.makeClientRow('rv'), 'Review Co');
    const member = await fx.makeUser('rv-member');
    await fx.addMembership(entityId, member.id, 'client_owner');
    const seeded = await seedExtraction(entityId);

    const page = await adminPage(browser);
    await page.goto(`/admin/documents/${seeded.documentId}`);
    await expect(page.getByText(/checks failing/i)).toBeVisible();
    await expect(page.getByText(/1 low-confidence line/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /publish to client/i })).toBeDisabled();

    // Rows are found through their editable input (row names change once a
    // line is marked corrected).
    const rowOf = (name: string) =>
      page.getByRole('row').filter({ has: page.getByRole('textbox', { name: `${name} Current` }) });

    // Fix the tampered total.
    await page.getByRole('textbox', { name: `${seeded.tampered.name} Current` }).fill(seeded.tampered.correct);
    await rowOf(seeded.tampered.name).getByRole('button', { name: /^save$/i }).click();
    await expect(rowOf(seeded.tampered.name).getByText(/corrected/i)).toBeVisible();

    // Confirm the low-confidence line as printed (no value change needed).
    await rowOf(seeded.low.name).getByRole('button', { name: /^confirm$/i }).click();

    await expect(page.getByText(/all checks pass/i)).toBeVisible();
    await expect(page.getByText(/no low-confidence lines/i)).toBeVisible();
    const publish = page.getByRole('button', { name: /publish to client/i });
    await expect(publish).toBeEnabled();

    // Before publishing the client cannot download.
    const memberPage = await (await browser.newContext()).newPage();
    await signIn(memberPage, member.email);
    const before = await memberPage.request.get(`/api/documents/${seeded.versionId}/download`, { maxRedirects: 0 });
    expect(before.status()).toBe(404);

    await publish.click();
    await page.getByRole('button', { name: /confirm publish/i }).click();
    await expect(page.getByText(/clients can see this document/i)).toBeVisible();

    const { data: doc } = await fx.admin.from('documents').select('status, published_at').eq('id', seeded.documentId).single();
    expect(doc?.status).toBe('published');
    expect(doc?.published_at).not.toBeNull();
    const { data: report } = await fx.admin.from('financial_reports').select('status, reconciliation').eq('document_version_id', seeded.versionId).single();
    expect(report?.status).toBe('published');

    const after = await memberPage.request.get(`/api/documents/${seeded.versionId}/download`, { maxRedirects: 0 });
    expect(after.status()).toBe(302);

    // Unpublish hides it again — history is untouched.
    await page.getByRole('button', { name: /^unpublish$/i }).click();
    await page.getByRole('button', { name: /confirm unpublish/i }).click();
    await expect(page.getByRole('button', { name: /publish to client/i })).toBeVisible();
    const hidden = await memberPage.request.get(`/api/documents/${seeded.versionId}/download`, { maxRedirects: 0 });
    expect(hidden.status()).toBe(404);
    const { count: lineCount } = await fx.admin.from('financial_statement_lines').select('id', { count: 'exact', head: true }).eq('business_entity_id', entityId);
    expect(lineCount).toBeGreaterThan(10);
  });
});
