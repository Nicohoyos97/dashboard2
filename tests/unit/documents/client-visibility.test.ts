// @vitest-environment node
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { DOCUMENT_TYPES, FIRM_ONLY_DOCUMENT_TYPES, isClientVisibleDocumentType } from '@/lib/documents/types';

const MIGRATION = readFileSync('supabase/migrations/0025_firm_only_documents.sql', 'utf8');

describe('firm-only documents', () => {
  it('keeps the point-of-sale report out of the client portal', () => {
    // Its figures are the client's own register and they belong in the portal;
    // the file is the export they sent us, and handing it back as a published
    // deliverable is not what the firm does with it.
    expect(isClientVisibleDocumentType('sales_report')).toBe(false);
  });

  it('leaves every other type client-visible', () => {
    const visible = DOCUMENT_TYPES.filter(isClientVisibleDocumentType);
    expect(visible).toEqual(DOCUMENT_TYPES.filter((type) => type !== 'sales_report'));
  });

  it('names only real document types', () => {
    for (const type of FIRM_ONLY_DOCUMENT_TYPES) expect(DOCUMENT_TYPES).toContain(type);
  });

  it('agrees with the database, which is where the rule is enforced', () => {
    // The TypeScript list only keeps the firm's own client preview honest —
    // RLS is what a client actually runs into. If the two drift, a document
    // disappears from a tile and is still downloadable, or the reverse.
    const body = MIGRATION.match(/select doc_type <> ([^;]+);/)?.[1] ?? '';
    const inSql = [...body.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    expect(inSql).toEqual([...FIRM_ONLY_DOCUMENT_TYPES]);
  });
});
