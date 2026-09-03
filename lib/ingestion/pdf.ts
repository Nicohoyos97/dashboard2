// PDF inspection and per-page splitting with pdf-lib. Bytes are never
// modified for storage or download (spec §9) — splitting only produces the
// one-page documents sent to the model, one document block per page.
import { PDFDocument } from 'pdf-lib';

import { IngestionError } from './errors';

export const MAX_PDF_BYTES = 30 * 1024 * 1024;
export const MAX_PDF_PAGES = 200;

const PDF_MAGIC = '%PDF-';

export function isPdf(buffer: Buffer): boolean {
  return buffer.length >= PDF_MAGIC.length && buffer.toString('latin1', 0, PDF_MAGIC.length) === PDF_MAGIC;
}

// pdf-lib is lenient at load time and fails lazily (page tree, copyPages) on
// corrupt files, so every pdf-lib call is mapped to `pdf_invalid` here.
async function guarded<T>(work: () => Promise<T> | T): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof IngestionError) throw error;
    throw new IngestionError('pdf_invalid');
  }
}

async function load(buffer: Buffer): Promise<PDFDocument> {
  if (!isPdf(buffer)) throw new IngestionError('pdf_invalid');
  if (buffer.length > MAX_PDF_BYTES) throw new IngestionError('pdf_too_large');
  return guarded(async () => {
    // ignoreEncryption lets us report `pdf_encrypted` from the parsed trailer
    // instead of matching pdf-lib's error text.
    const doc = await PDFDocument.load(buffer, { ignoreEncryption: true, updateMetadata: false });
    if (doc.isEncrypted) throw new IngestionError('pdf_encrypted');
    const pageCount = doc.getPageCount();
    if (pageCount === 0) throw new IngestionError('pdf_invalid');
    if (pageCount > MAX_PDF_PAGES) throw new IngestionError('pdf_too_many_pages');
    return doc;
  });
}

/** Validates magic bytes, size, encryption and page limits; returns the page count. */
export async function getPageCount(buffer: Buffer): Promise<number> {
  return (await load(buffer)).getPageCount();
}

/** One single-page PDF per page, in document order. */
export async function splitPages(buffer: Buffer): Promise<Buffer[]> {
  const doc = await load(buffer);
  return guarded(async () => {
    const pages: Buffer[] = [];
    for (let index = 0; index < doc.getPageCount(); index += 1) {
      const single = await PDFDocument.create({ updateMetadata: false });
      const [page] = await single.copyPages(doc, [index]);
      if (!page) throw new IngestionError('pdf_invalid');
      single.addPage(page);
      pages.push(Buffer.from(await single.save({ useObjectStreams: false })));
    }
    return pages;
  });
}
