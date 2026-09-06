// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { entityConfigFields, isDbaIssue, refineDba } from '@/lib/firm/schemas';

// "Does this business have a DBA?" — no means the name is not asked for, yes
// means it is required. The rule lives in three places on purpose (form,
// Server Action, CHECK constraint); this covers the middle one, which is the
// only one a caller can reach without a browser.
const schema = z.object(entityConfigFields).superRefine(refineDba);

const base = {
  name: 'Tropical Bites',
  legalName: 'Tropical Bites LLC',
  hasDba: false,
  dbaName: '',
  fiscalYearStartMonth: 1,
  accountingBasis: 'cash' as const,
  currency: 'USD',
  timezone: 'UTC',
  salesTaxEnabled: false,
  salesTax: { state: '', hasCityTax: false, cities: [] },
  enabledModules: { bookkeeping: true, income_taxes: true },
  industry: '',
  logoUrl: null,
};

describe('the DBA answer and its name', () => {
  it('accepts "no" with no name', () => {
    expect(schema.safeParse(base).success).toBe(true);
  });

  it('rejects "yes" with no name, and says which field', () => {
    const result = schema.safeParse({ ...base, hasDba: true });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(isDbaIssue(result.error)).toBe(true);
    expect(result.error.issues.some((i) => i.path.includes('dbaName'))).toBe(true);
  });

  it('rejects "yes" with only whitespace — a space is not a trade name', () => {
    const result = schema.safeParse({ ...base, hasDba: true, dbaName: '   ' });
    expect(result.success).toBe(false);
    if (!result.success) expect(isDbaIssue(result.error)).toBe(true);
  });

  it('accepts "yes" with a name', () => {
    const result = schema.safeParse({ ...base, hasDba: true, dbaName: 'Tropical Bites Café' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.dbaName).toBe('Tropical Bites Café');
  });

  it('does not confuse an unrelated failure for a DBA one', () => {
    // The caller shows a specific message on isDbaIssue, so a missing business
    // name must not be reported as a missing DBA.
    const result = schema.safeParse({ ...base, name: '' });
    expect(result.success).toBe(false);
    if (!result.success) expect(isDbaIssue(result.error)).toBe(false);
  });
});
