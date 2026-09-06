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

  // The label is per test: these run in parallel and makeFirmUser derives the
  // email from it, so a shared one has two workers registering the same address.
  async function adminPage(browser: Browser, label: string): Promise<Page> {
    const firm = await fx.makeFirmUser(`rv-admin-${label}`);
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

  // The review dance every publish needs: fix the tampered total, confirm the
  // low-confidence line, publish.
  async function correctAndPublish(page: Page, seeded: Awaited<ReturnType<typeof seedExtraction>>): Promise<void> {
    await page.goto(`/admin/documents/${seeded.documentId}`);
    const rowOf = (name: string) =>
      page.getByRole('row').filter({ has: page.getByRole('textbox', { name: `${name} Current` }) });
    await page.getByRole('textbox', { name: `${seeded.tampered.name} Current` }).fill(seeded.tampered.correct);
    await rowOf(seeded.tampered.name).getByRole('button', { name: /^save$/i }).click();
    await expect(rowOf(seeded.tampered.name).getByText(/corrected/i)).toBeVisible();
    await rowOf(seeded.low.name).getByRole('button', { name: /^confirm$/i }).click();
    const publish = page.getByRole('button', { name: /publish to client/i });
    await expect(publish).toBeEnabled({ timeout: 20_000 });
    await publish.click();
    await page.getByRole('button', { name: /confirm publish/i }).click();
    // Publishing is an action, a revalidate and a router refresh in one round
    // trip; the dev server can take a while over it when the suite is parallel.
    await expect(page.getByText(/clients can see this document/i)).toBeVisible({ timeout: 30_000 });
  }

  // §14.19: publishing the same statement twice retires the first report. It
  // leaves the client's view, never the firm's.
  test('a superseded report stays in the document history, pointing at what replaced it', async ({ browser }) => {
    const entityId = await fx.makeEntity(await fx.makeClientRow('sup'), 'Supersede Co');
    const first = await seedExtraction(entityId);
    const second = await seedExtraction(entityId);

    const page = await adminPage(browser, 'history');
    await correctAndPublish(page, first);
    await correctAndPublish(page, second);

    await page.goto(`/admin/documents/${first.documentId}`);
    await expect(page.getByRole('heading', { name: /report history/i })).toBeVisible();
    const retired = page.getByRole('row').filter({ hasText: /superseded/i });
    await expect(retired).toHaveCount(1);
    await expect(retired.getByRole('link')).toHaveAttribute('href', new RegExp(second.documentId));

    const { data: report } = await fx.admin
      .from('financial_reports')
      .select('status, published_at, superseded_by')
      .eq('document_version_id', first.versionId)
      .single();
    expect(report?.status).toBe('superseded');
    expect(report?.published_at).toBeNull();
    expect(report?.superseded_by).not.toBeNull();
  });

  test('corrections unlock publish; client visibility follows publication', async ({ browser }) => {
    const entityId = await fx.makeEntity(await fx.makeClientRow('rv'), 'Review Co');
    const member = await fx.makeUser('rv-member');
    await fx.addMembership(entityId, member.id, 'client_owner');
    const seeded = await seedExtraction(entityId);

    const page = await adminPage(browser, 'publish');
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

    // A tax obligation on the same version: publishing stamps five tables, and
    // withdrawing used to reverse only two — so a retracted filing left its
    // obligations `published_at` and visible in the client's Sales Taxes page.
    const { data: obligation } = await fx.admin
      .from('tax_obligations')
      .insert({ business_entity_id: entityId, tax_type: 'sales', source: 'firm_document', document_version_id: seeded.versionId, published_at: new Date().toISOString() })
      .select('id')
      .single();

    // Unpublish hides it again — history is untouched.
    await page.getByRole('button', { name: /^unpublish$/i }).click();
    await page.getByRole('button', { name: /confirm unpublish/i }).click();
    await expect(page.getByRole('button', { name: /publish to client/i })).toBeVisible();
    const hidden = await memberPage.request.get(`/api/documents/${seeded.versionId}/download`, { maxRedirects: 0 });
    expect(hidden.status()).toBe(404);

    const { data: withdrawnObligation } = await fx.admin.from('tax_obligations').select('published_at').eq('id', obligation!.id).single();
    expect(withdrawnObligation?.published_at, 'withdrawing must clear the figures the document published').toBeNull();
    const { count: lineCount } = await fx.admin.from('financial_statement_lines').select('id', { count: 'exact', head: true }).eq('business_entity_id', entityId);
    expect(lineCount).toBeGreaterThan(10);
  });

  test('a sales report with refunds and discounts can be published', async ({ browser }) => {
    test.slow();
    // What was actually blocking August, driven the way it was hit. Three
    // things had to be true and none of them were: publishBlockers never looked
    // at sales_reports, so the report's own passing reconciliation went unread;
    // the obligation a sales report opens carried no reconciliation, which
    // blocks anything pointing at it; and the cross-check compared the report
    // to its own net sales and called refunds + discounts a discrepancy.
    const entityId = (await fx.makeTenant('rpub')).entityId;
    const { data: doc } = await fx.admin
      .from('documents')
      .insert({
        business_entity_id: entityId, document_type: 'sales_report',
        title: 'August sales', status: 'reconciled',
        period_start: '2026-08-01', period_end: '2026-08-31',
      })
      .select('id')
      .single();
    const { data: version } = await fx.admin
      .from('document_versions')
      .insert({
        document_id: doc!.id, business_entity_id: entityId, version_no: 1,
        storage_path: `${entityId}/${doc!.id}/v1/aug.pdf`, original_filename: 'aug.pdf',
        mime_type: 'application/pdf', size_bytes: 10, sha256: randomUUID().replace(/-/g, ''),
        upload_status: 'uploaded',
      })
      .select('id')
      .single();
    await fx.admin.from('documents').update({ current_version_id: version!.id }).eq('id', doc!.id);

    const passing = { passed: true, checks: [], lowConfidence: { count: 0, refs: [] } };
    await fx.admin.from('sales_reports').insert({
      business_entity_id: entityId, source_system: 'clover',
      period_start: '2026-08-01', period_end: '2026-08-31', currency: 'USD',
      gross_sales: 13227.31, net_sales: 13157.31, refunds: 55.0, discounts: 15.0,
      tax_collected: 1401.07, amount_collected: 15881.93, order_count: 478,
      source: 'firm_document', document_version_id: version!.id,
      status: 'reconciled', reconciliation: passing,
    });
    // The obligation a sales report opens: its own two columns, no filing yet.
    await fx.admin.from('tax_obligations').insert({
      business_entity_id: entityId, tax_type: 'sales',
      period_start: '2026-08-01', period_end: '2026-08-31',
      taxable_sales: 13157.31, tax_collected: 1401.07,
      status: 'pending_review', source: 'firm_document', reconciliation: passing,
    });

    const page = await adminPage(browser, 'salespub');
    await page.goto(`/admin/documents/${doc!.id}`);
    await expect(page.getByRole('button', { name: /publish to client/i })).toBeEnabled();
    // And no invented discrepancy: refunds + discounts is not a finding.
    await expect(page.getByText(/difference of \$70/i)).toHaveCount(0);
  });

  test('marking a tax obligation paid from the business page', async ({ browser }) => {
    test.slow();
    // The gap this closes: the pipeline could only mark an obligation paid from
    // an uploaded confirmation, and most payments are an ACH transfer whose
    // confirmation is a number in an email. A settled quarter sat on the
    // client's portal as a balance.
    const tenant = await fx.makeTenant('rpaid');
    const now = new Date().toISOString();
    const { data: obligation } = await fx.admin
      .from('tax_obligations')
      .insert({
        business_entity_id: tenant.entityId, tax_type: 'sales',
        period_start: '2026-07-01', period_end: '2026-07-31', due_date: '2026-08-20',
        amount_payable: 1328.0, status: 'payable', source: 'firm_document',
        published_at: now,
      })
      .select('id')
      .single();

    const page = await adminPage(browser, 'markpaid');
    await page.goto(`/admin/entities/${tenant.entityId}`);
    await expect(page.getByText(/payable/i).first()).toBeVisible();
    await page.getByRole('button', { name: /^mark as paid$/i }).first().click();
    await page.fill(`#paid-${obligation!.id}`, '2026-08-18');
    await page.fill(`#conf-${obligation!.id}`, 'ACH-99120');
    await page.getByRole('button', { name: /^mark as paid$/i }).last().click();
    await expect(page.getByText(/paid 2026|paid aug|pagado/i).first()).toBeVisible();

    const { data: after } = await fx.admin
      .from('tax_obligations')
      .select('status, amount_paid, amount_payable, document_version_id')
      .eq('id', obligation!.id)
      .single();
    expect(after!.status).toBe('paid');
    expect(Number(after!.amount_paid)).toBe(1328);
    // amount_payable stays as the record of what was owed — the portal reads
    // status === 'paid' first and shows nothing outstanding.
    expect(Number(after!.amount_payable)).toBe(1328);
    expect(after!.document_version_id, 'a payment is not a filing').toBeNull();

    const { data: payments } = await fx.admin
      .from('tax_payments')
      .select('paid_on, amount, confirmation_number, source, published_at')
      .eq('obligation_id', obligation!.id);
    expect(payments).toHaveLength(1);
    expect(payments![0]!.confirmation_number).toBe('ACH-99120');
    expect(payments![0]!.source).toBe('firm_entry');
    // The obligation is published, so the payment behind it is too.
    expect(payments![0]!.published_at, 'a settled obligation must show its payment').not.toBeNull();

    // Editing replaces the entry rather than stacking a second one.
    await page.reload();
    await page.getByRole('button', { name: /^edit payment$/i }).first().click();
    await page.fill(`#amt-${obligation!.id}`, '1300.00');
    await page.getByRole('button', { name: /^mark as paid$/i }).last().click();
    await expect(page.getByText('1,300.00').first()).toBeVisible();
    const { data: again } = await fx.admin
      .from('tax_payments')
      .select('amount')
      .eq('obligation_id', obligation!.id);
    expect(again, 'one firm entry, corrected').toHaveLength(1);
    expect(Number(again![0]!.amount)).toBe(1300);
    if (process.env.SHOT === '1') {
      await page.locator('section').filter({ hasText: /tax obligations/i }).first().screenshot({ path: 'test-results/paid.png' });
    }
  });

  test('deleting a document from the review page: refused while published, then it and its bytes go', async ({ browser }) => {
    test.slow();
    const entityId = (await fx.makeTenant('rdel')).entityId;
    const seeded = await seedExtraction(entityId);
    const page = await adminPage(browser, 'delete');
    await page.goto(`/admin/documents/${seeded.documentId}`);

    // Published: the control refuses and says why, rather than being a
    // disabled button with no explanation.
    await correctAndPublish(page, seeded);
    const deleteButton = page.getByRole('button', { name: /^delete document$/i });
    await expect(deleteButton).toBeDisabled();
    await expect(page.getByText(/withdraw it first/i)).toBeVisible();

    await page.getByRole('button', { name: /^unpublish$/i }).click();
    await page.getByRole('button', { name: /confirm unpublish/i }).click();
    await expect(page.getByRole('button', { name: /publish to client/i })).toBeVisible();

    // Withdrawn: now it goes, and takes its version and its file with it.
    await expect(deleteButton).toBeEnabled();
    await deleteButton.click();
    await page.getByRole('button', { name: /permanently/i }).click();
    await expect(page).toHaveURL(new RegExp(`/admin/entities/${entityId}$`));

    const { data: gone } = await fx.admin.from('documents').select('id').eq('id', seeded.documentId);
    expect(gone ?? []).toHaveLength(0);
    const { data: versions } = await fx.admin.from('document_versions').select('id').eq('document_id', seeded.documentId);
    expect(versions ?? []).toHaveLength(0);
    const { data: files } = await fx.admin.storage.from('documents').list(`${entityId}/${seeded.documentId}/v1`);
    expect(files ?? []).toHaveLength(0);
  });
});
