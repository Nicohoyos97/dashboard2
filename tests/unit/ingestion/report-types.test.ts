// @vitest-environment node
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { REPORT_TYPES } from '@/lib/ingestion/schemas/classification';
import { DOCUMENT_TYPES } from '@/lib/documents/types';

// The classifier's vocabulary and the CHECK constraints that store it are two
// copies of one fact, and nothing was comparing them. 0022 added `sales_report`
// to the enum and to `documents.document_type` but not to
// `document_pages.report_type`, so the first real Clover report classified
// correctly and then failed at persist_pages against a constraint that had
// never heard of the label. These read the migrations rather than the database
// so they run without one.
function constraintValues(pattern: RegExp): string[] {
  const sql = ['0003_documents.sql', '0022_sales_reports.sql', '0023_document_pages_sales_report.sql']
    .map((file) => readFileSync(`supabase/migrations/${file}`, 'utf8'))
    .join('\n');
  // The last definition wins, the way the migrations apply.
  const matches = [...sql.matchAll(pattern)];
  const last = matches.at(-1);
  if (!last?.[1]) throw new Error(`constraint not found for ${pattern}`);
  return [...last[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]!).sort();
}

describe('the classifier vocabulary and the database agree', () => {
  it('document_pages.report_type stores every REPORT_TYPES value', () => {
    const stored = constraintValues(/document_pages[\s\S]*?report_type\s*(?:=\s*any\s*\(array)?\s*(\[[\s\S]*?\])/gi);
    expect(stored).toEqual([...REPORT_TYPES].sort());
  });

  it('documents.document_type stores every DOCUMENT_TYPES value', () => {
    const stored = constraintValues(/documents_document_type_check[\s\S]*?in\s*\(([\s\S]*?)\)\s*\)/gi);
    expect(stored).toEqual([...DOCUMENT_TYPES].sort());
  });
});
