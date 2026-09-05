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
