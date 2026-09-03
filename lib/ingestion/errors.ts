// Typed failures of the ingestion library. Messages are fixed per code and
// `detail` may only carry identifiers (page numbers, schema paths, stop
// reasons) — never document content or figures (INITIAL_PROMPT.md §3).

export const INGESTION_ERROR_CODES = [
  'pdf_invalid',
  'pdf_encrypted',
  'pdf_too_large',
  'pdf_too_many_pages',
  'extraction_truncated',
  'model_refusal',
  'schema_invalid',
  'page_out_of_range',
  'csv_unparseable',
  'csv_mapping_invalid',
] as const;

export type IngestionErrorCode = (typeof INGESTION_ERROR_CODES)[number];

const MESSAGES: Record<IngestionErrorCode, string> = {
  pdf_invalid: 'The file is not a readable PDF',
  pdf_encrypted: 'The PDF is password-protected or encrypted',
  pdf_too_large: 'The PDF exceeds the size limit',
  pdf_too_many_pages: 'The PDF exceeds the page limit',
  extraction_truncated: 'The model output was cut off before the extraction completed',
  model_refusal: 'The model declined to process the document',
  schema_invalid: 'The model output did not match the expected schema',
  page_out_of_range: 'The model referenced a page that was not part of the request',
  csv_unparseable: 'The CSV could not be parsed (a header row and at least one data row are required)',
  csv_mapping_invalid: 'The proposed CSV column mapping does not match the file headers',
};

export class IngestionError extends Error {
  readonly code: IngestionErrorCode;
  readonly detail: string | null;

  constructor(code: IngestionErrorCode, detail?: string) {
    super(detail ? `${MESSAGES[code]} (${detail})` : MESSAGES[code]);
    this.name = 'IngestionError';
    this.code = code;
    this.detail = detail ?? null;
  }
}

export function isIngestionError(error: unknown): error is IngestionError {
  return error instanceof IngestionError;
}
