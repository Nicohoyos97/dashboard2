// @vitest-environment node
import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';

import { IngestionError } from '@/lib/ingestion/errors';
import { MAX_PDF_BYTES, MAX_PDF_PAGES, getPageCount, isPdf, splitPages } from '@/lib/ingestion/pdf';

import { readFixture } from './helpers/anthropic-mock';

async function expectCode(promise: Promise<unknown>, code: IngestionError['code']): Promise<void> {
  await expect(promise).rejects.toMatchObject({ name: 'IngestionError', code });
}

describe('isPdf', () => {
  it('checks the %PDF- magic bytes', () => {
    expect(isPdf(readFixture('letter-and-pnl.pdf'))).toBe(true);
    expect(isPdf(Buffer.from('%PDF-1.7\n'))).toBe(true);
    expect(isPdf(Buffer.from('PDF-1.7'))).toBe(false);
    expect(isPdf(Buffer.from(''))).toBe(false);
    expect(isPdf(Buffer.from(' %PDF-1.7'))).toBe(false);
  });
});

describe('getPageCount', () => {
  it.each([
    ['letter-and-pnl.pdf', 3],
    ['balance-sheet.pdf', 1],
    ['balance-sheet-unbalanced.pdf', 1],
    ['bank-statement.pdf', 2],
    ['sales-tax-confirmation.pdf', 1],
  ])('counts the pages of %s', async (name, pages) => {
    await expect(getPageCount(readFixture(name))).resolves.toBe(pages);
  });

  it('rejects non-PDF bytes with pdf_invalid', async () => {
    await expectCode(getPageCount(Buffer.from('hello world')), 'pdf_invalid');
  });

  it('rejects a PDF header followed by garbage (no pages) with pdf_invalid', async () => {
    await expectCode(getPageCount(Buffer.from('%PDF-1.4 garbage')), 'pdf_invalid');
  });

  it('rejects oversized files before parsing them', async () => {
    const huge = Buffer.alloc(MAX_PDF_BYTES + 1);
    huge.write('%PDF-1.7');
    await expectCode(getPageCount(huge), 'pdf_too_large');
  });

  it('rejects documents over the page limit', async () => {
    const doc = await PDFDocument.create();
    for (let i = 0; i <= MAX_PDF_PAGES; i += 1) doc.addPage([100, 100]);
    await expectCode(getPageCount(Buffer.from(await doc.save())), 'pdf_too_many_pages');
  });

  it('rejects encrypted documents with pdf_encrypted', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([100, 100]);
    // pdf-lib cannot encrypt, but an /Encrypt entry in the trailer is what marks a PDF as encrypted.
    doc.context.trailerInfo.Encrypt = doc.context.register(doc.context.obj({ Filter: 'Standard', V: 1, R: 2, P: -1 }));
    await expectCode(getPageCount(Buffer.from(await doc.save({ useObjectStreams: false }))), 'pdf_encrypted');
  });
});

describe('splitPages', () => {
  it('produces one single-page PDF per page, in order', async () => {
    const pages = await splitPages(readFixture('letter-and-pnl.pdf'));
    expect(pages).toHaveLength(3);
    for (const page of pages) {
      expect(isPdf(page)).toBe(true);
      await expect(getPageCount(page)).resolves.toBe(1);
    }
    // Page 2 carries the P&L table, page 1 the letter: the drawn text differs.
    expect(pages[0]?.equals(pages[1] ?? Buffer.alloc(0))).toBe(false);
  });

  it('base64 of a split page has no line breaks', async () => {
    const [page] = await splitPages(readFixture('sales-tax-confirmation.pdf'));
    expect(page?.toString('base64')).not.toMatch(/[\r\n]/);
  });
});
