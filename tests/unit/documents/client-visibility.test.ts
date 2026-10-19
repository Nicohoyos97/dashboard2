// @vitest-environment node
import { readFileSync, readdirSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { DOCUMENT_TYPES, FIRM_ONLY_DOCUMENT_TYPES, isClientVisibleDocumentType } from '@/lib/documents/types';

// Every migration in order: the last definition of the function is the one in force (0025, then 0026).
const MIGRATIONS = readdirSync('supabase/migrations')
  .filter((file) => file.endsWith('.sql'))
  .sort()
  .map((file) => readFileSync(`supabase/migrations/${file}`, 'utf8'))
  .join('\n');

describe('firm-only documents', () => {
  it('keeps the point-of-sale report out of the client portal', () => {
    // Its figures are the client's own register and they belong in the portal;
    // the file is the export they sent us, and handing it back as a published
    // deliverable is not what the firm does with it.
    expect(isClientVisibleDocumentType('sales_report')).toBe(false);
  });

  it('keeps the General Ledger file with the firm: its P&L accounts reach the client as transactions', () => {
    expect(isClientVisibleDocumentType('general_ledger')).toBe(false);
  });

  it('leaves every other type client-visible', () => {
    const visible = DOCUMENT_TYPES.filter(isClientVisibleDocumentType);
    expect(visible).toEqual(DOCUMENT_TYPES.filter((type) => type !== 'sales_report' && type !== 'general_ledger'));
  });

  it('names only real document types', () => {
    for (const type of FIRM_ONLY_DOCUMENT_TYPES) expect(DOCUMENT_TYPES).toContain(type);
  });

  it('agrees with the database, which is where the rule is enforced', () => {
    // The TypeScript list only keeps the firm's own client preview honest —
    // RLS is what a client actually runs into. If the two drift, a document
    // disappears from a tile and is still downloadable, or the reverse.
    const bodies = [...MIGRATIONS.matchAll(/function public\.document_type_is_client_visible[\s\S]*?select doc_type (?:<>|not in) ([^;]+);/g)];
    const body = bodies.at(-1)?.[1] ?? '';
    const inSql = [...body.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    expect(inSql).toEqual([...FIRM_ONLY_DOCUMENT_TYPES]);
  });
});
