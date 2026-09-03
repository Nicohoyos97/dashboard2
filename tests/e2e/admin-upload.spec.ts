import { createHash } from 'node:crypto';

import { type Browser, type Page, expect, test } from '@playwright/test';
import { PDFDocument, StandardFonts } from 'pdf-lib';

import { Fixtures, PASSWORD, supabaseEnv } from './helpers/fixtures';
import { totp } from './helpers/totp';

// Acceptance §14.2–3 and §14.9 through the browser: the admin uploads a PDF
// (bytes go browser → private bucket), the server validates + checksums it and
// queues a job; a duplicate is rejected; the exact original bytes come back
// only through the audited, short-lived signed-URL route — and only to people
// allowed to see the document.
async function makePdf(text: string): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([612, 792]);
  page.drawText(text, { x: 72, y: 700, size: 14, font });
  doc.addPage([612, 792]).drawText('Page two', { x: 72, y: 700, size: 14, font });
  return Buffer.from(await doc.save());
}

test.describe('Firm portal: upload + original download', () => {
  test.skip(!supabaseEnv(), 'Supabase env not available');
  test.setTimeout(120_000);

  const fx = new Fixtures();
  test.afterAll(() => fx.cleanup());

  async function signIn(page: Page, email: string): Promise<void> {
    await page.goto('/signin');
    await page.fill('#email', email);
    await page.fill('#password', PASSWORD);
    await page.getByRole('button', { name: /^sign in$/i }).click();
    await expect(page).toHaveURL(/\/dashboard/);
  }

  async function adminPage(browser: Browser): Promise<Page> {
    const firm = await fx.makeFirmUser('up-admin');
    const page = await (await browser.newContext()).newPage();
    await signIn(page, firm.email);
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/admin\/mfa/);
    const secret = (await page.locator('code').first().textContent())?.trim() ?? '';
    await page.fill('#totp', totp(secret));
    await page.getByRole('button', { name: /activate and continue/i }).click();
    await expect(page).toHaveURL(/\/admin$/);
    return page;
  }

  test('upload → checksum + job → duplicate rejected → gated download', async ({ browser }) => {
    const stamp = Date.now().toString(36);
    const clientId = await fx.makeClientRow(`up-${stamp}`);
    const entityId = await fx.makeEntity(clientId, `Upload Co ${stamp}`);
    const member = await fx.makeUser('up-member');
    await fx.addMembership(entityId, member.id, 'client_owner');
    const outsider = await fx.makeTenant('up-outsider');

    const pdf = await makePdf(`Profit and Loss ${stamp}`);
    const sha256 = createHash('sha256').update(pdf).digest('hex');

    const page = await adminPage(browser);
    await page.goto('/admin/upload');
    await page.selectOption('#uploadClient', clientId);
    await page.selectOption('#uploadEntity', entityId);
    await page.setInputFiles('#uploadFiles', {
      name: `pnl-${stamp}.pdf`,
      mimeType: 'application/pdf',
      buffer: pdf,
    });
    await page.selectOption('select[id^="type-"]', 'profit_and_loss');
    await page.getByRole('button', { name: /upload 1 file/i }).click();
    await expect(page.getByText(/queued for processing/i)).toBeVisible({ timeout: 30_000 });

    // ── Stored unchanged, with checksum, page count and a pending job ──────
    const { data: version } = await fx.admin
      .from('document_versions')
      .select('id, sha256, page_count, upload_status, version_no, storage_path, document_id')
      .eq('business_entity_id', entityId)
      .single();
    expect(version?.upload_status).toBe('uploaded');
    expect(version?.sha256).toBe(sha256);
    expect(version?.page_count).toBe(2);
    expect(version?.version_no).toBe(1);
    const { data: job } = await fx.admin
      .from('document_processing_jobs')
      .select('status, step')
      .eq('document_version_id', version!.id)
      .single();
    expect(job).toEqual({ status: 'pending', step: 'split' });

    // Review page shows the version and the job.
    await page.getByRole('link', { name: /^review$/i }).click();
    await expect(page).toHaveURL(new RegExp(`/admin/documents/${version!.document_id}`));
    await expect(page.getByRole('cell', { name: /v1.*current/ })).toBeVisible();
    await expect(page.getByText('pending')).toBeVisible();

    // ── Same bytes again → rejected as a duplicate ────────────────────────
    await page.goto('/admin/upload');
    await page.selectOption('#uploadClient', clientId);
    await page.selectOption('#uploadEntity', entityId);
    await page.setInputFiles('#uploadFiles', {
      name: `pnl-again-${stamp}.pdf`,
      mimeType: 'application/pdf',
      buffer: pdf,
    });
    await page.getByRole('button', { name: /upload 1 file/i }).click();
    await expect(page.getByText(/already uploaded/i)).toBeVisible({ timeout: 30_000 });

    // ── A replacement: new version of the same document ──────────────────
    const pdf2 = await makePdf(`Profit and Loss ${stamp} (corrected)`);
    await page.goto(`/admin/upload?document=${version!.document_id}`);
    await expect(page.getByText(/new version of/i)).toBeVisible();
    await expect(page.locator('#uploadEntity')).toBeDisabled();
    await page.setInputFiles('#uploadFiles', { name: `pnl-v2-${stamp}.pdf`, mimeType: 'application/pdf', buffer: pdf2 });
    await page.getByRole('button', { name: /upload 1 file/i }).click();
    await expect(page.getByText(/queued for processing/i)).toBeVisible({ timeout: 30_000 });
    const { data: versions } = await fx.admin
      .from('document_versions')
      .select('id, version_no, storage_path')
      .eq('document_id', version!.document_id)
      .order('version_no');
    expect(versions?.map((v) => v.version_no)).toEqual([1, 2]);
    const { data: docAfterV2 } = await fx.admin.from('documents').select('current_version_id').eq('id', version!.document_id).single();
    expect(docAfterV2?.current_version_id).toBe(versions![1]!.id);
    await fx.admin.storage.from('documents').remove([versions![1]!.storage_path]);

    // ── Download: admin gets a 302 to a signed URL serving the exact bytes ─
    const adminRes = await page.request.get(`/api/documents/${version!.id}/download`, {
      maxRedirects: 0,
    });
    expect(adminRes.status()).toBe(302);
    const signedUrl = adminRes.headers()['location'] ?? '';
    expect(signedUrl).toContain('/storage/v1/object/sign/documents/');
    const bytes = await (await fetch(signedUrl)).arrayBuffer();
    expect(createHash('sha256').update(Buffer.from(bytes)).digest('hex')).toBe(sha256);

    // ── Unpublished: the member gets 404; an outsider gets 404 ────────────
    const memberPage = await (await browser.newContext()).newPage();
    await signIn(memberPage, member.email);
    const memberRes = await memberPage.request.get(`/api/documents/${version!.id}/download`, {
      maxRedirects: 0,
    });
    expect(memberRes.status()).toBe(404);

    // Publish (service role, as the review flow will) → the member can download.
    await fx.admin
      .from('documents')
      .update({ status: 'published', published_at: new Date().toISOString(), current_version_id: version!.id })
      .eq('id', version!.document_id);
    const memberRes2 = await memberPage.request.get(`/api/documents/${version!.id}/download`, {
      maxRedirects: 0,
    });
    expect(memberRes2.status()).toBe(302);

    const outsiderPage = await (await browser.newContext()).newPage();
    await signIn(outsiderPage, outsider.email);
    const outsiderRes = await outsiderPage.request.get(`/api/documents/${version!.id}/download`, {
      maxRedirects: 0,
    });
    expect(outsiderRes.status()).toBe(404);

    // Anonymous → 401.
    const anon = await (await browser.newContext()).newPage();
    const anonRes = await anon.request.get(`/api/documents/${version!.id}/download`, {
      maxRedirects: 0,
    });
    expect(anonRes.status()).toBe(401);

    // Audit rows exist for the upload and the downloads, identifiers only.
    const { data: audit } = await fx.admin
      .from('audit_logs')
      .select('action')
      .eq('business_entity_id', entityId)
      .in('action', ['document.upload', 'document.download']);
    expect((audit ?? []).map((a) => a.action).sort()).toEqual([
      'document.download',
      'document.download',
      'document.upload',
      'document.upload',
    ]);

    // Storage objects do not cascade with rows: remove what this test uploaded.
    await fx.admin.storage.from('documents').remove([version!.storage_path]);
  });
});
