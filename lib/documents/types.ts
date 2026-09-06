// Shared vocabulary for the document pipeline UI and actions (mirrors the
// check constraints in 0003_documents.sql).
export const DOCUMENT_TYPES = [
  'bank_statement',
  'profit_and_loss',
  'balance_sheet',
  'statement_package',
  // A point-of-sale sales report (Clover, Toast, Square, Stripe): what was
  // sold. Deliberately distinct from the tax documents below, which say what
  // is owed — see 0022 for why the two must not feed the same figures.
  'sales_report',
  'sales_tax_filing',
  'sales_tax_payment',
  'income_tax_document',
  'payroll_summary',
  'csv_transactions',
  'other_report',
] as const;

export type DocumentType = (typeof DOCUMENT_TYPES)[number];

// Types the client never sees in their portal. A point-of-sale report is the
// firm's working paper: it is the client's own register export, sent to us so
// the books can be built from it, and what belongs back in their portal is the
// figures — net sales, tips, tax collected — not the file. Publishing it is
// still what makes those figures visible, so this is a visibility rule on the
// document row alone, enforced in the database by 0025 and mirrored here so
// the firm's "preview as client" shows what the client actually has.
export const FIRM_ONLY_DOCUMENT_TYPES: readonly DocumentType[] = ['sales_report'];

export function isClientVisibleDocumentType(documentType: string): boolean {
  return !(FIRM_ONLY_DOCUMENT_TYPES as readonly string[]).includes(documentType);
}

export const DOCUMENT_STATUSES = [
  'uploaded',
  'processing',
  'needs_review',
  'reconciled',
  'ready_to_publish',
  'published',
  'failed',
  'superseded',
] as const;

export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

export function isDocumentStatus(value: string | undefined): value is DocumentStatus {
  return (DOCUMENT_STATUSES as readonly string[]).includes(value ?? '');
}

export const UPLOAD_MIME_TYPES = ['application/pdf', 'text/csv', 'text/plain'] as const;
export type UploadMimeType = (typeof UPLOAD_MIME_TYPES)[number];

export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024; // matches the bucket limit

export function defaultDocumentType(mime: UploadMimeType): DocumentType {
  return mime === 'application/pdf' ? 'statement_package' : 'csv_transactions';
}

// Keep the original name for the client download, but never let a path or
// control character into the storage key.
export function safeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? 'document';
  const cleaned = base.replace(/[^\w.\- ()]/g, '_').replace(/\s+/g, ' ').trim();
  return (cleaned || 'document').slice(0, 120);
}
