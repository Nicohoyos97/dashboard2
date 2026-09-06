// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { salesTaxRows } from '@/lib/firm/jurisdictions';
import { entityConfigFields, refineEntity, salesTaxIssue } from '@/lib/firm/schemas';
import { citySlug, cityJurisdictionCode, isUsStateCode } from '@/lib/taxes/us-jurisdictions';

// Selling the sales-tax module means knowing where it is collected. The rule
// runs in the form, in the Server Action and — for the rows it produces — in
// the CHECK constraints of 0024; this covers the middle one and the codes the
// database will be asked to accept.
const schema = z.object(entityConfigFields).superRefine(refineEntity);

const base = {
  name: 'Tropical Bites',
  legalName: '',
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

// What the database will refuse (0024 tax_jurisdictions_code_shape).
const CODE_SHAPE = /^US-[A-Z]{2}(-[A-Z0-9-]+)?$/;

describe('the sales-tax registration a business is saved with', () => {
  it('does not ask where when the module is off', () => {
    expect(schema.safeParse(base).success).toBe(true);
  });

  it('refuses the module without a state, and says which field', () => {
    const result = schema.safeParse({ ...base, salesTaxEnabled: true });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(salesTaxIssue(result.error)).toBe('state');
    expect(result.error.issues.some((issue) => issue.path.join('.') === 'salesTax.state')).toBe(true);
  });

  it('refuses "a city collects it too" with no city named', () => {
    const result = schema.safeParse({
      ...base,
      salesTaxEnabled: true,
      salesTax: { state: 'IL', hasCityTax: true, cities: ['  '] },
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(salesTaxIssue(result.error)).toBe('city');
  });

  it('accepts a state with the cities under it', () => {
    const result = schema.safeParse({
      ...base,
      salesTaxEnabled: true,
      salesTax: { state: 'IL', hasCityTax: true, cities: ['City of Niles'] },
    });
    expect(result.success).toBe(true);
  });

  it('refuses something that is not a state', () => {
    // The select cannot produce this; a hand-made call can.
    const result = schema.safeParse({
      ...base,
      salesTaxEnabled: true,
      salesTax: { state: 'ZZ', hasCityTax: false, cities: [] },
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(salesTaxIssue(result.error)).toBeNull();
    expect(isUsStateCode('IL')).toBe(true);
    expect(isUsStateCode('PR')).toBe(true);
  });

  it('does not report an unrelated failure as a missing jurisdiction', () => {
    const result = schema.safeParse({ ...base, name: '' });
    expect(result.success).toBe(false);
    if (!result.success) expect(salesTaxIssue(result.error)).toBeNull();
  });
});

describe('the rows a registration becomes', () => {
  const registration = { state: 'IL', hasCityTax: true, cities: ['City of Niles', 'Village of Skokie'] };

  it('is the state and the cities under it, state first', () => {
    expect(salesTaxRows(registration, true)).toEqual([
      { level: 'state', name: 'Illinois', code: 'US-IL' },
      { level: 'local', name: 'City of Niles', code: 'US-IL-CITY-OF-NILES' },
      { level: 'local', name: 'Village of Skokie', code: 'US-IL-VILLAGE-OF-SKOKIE' },
    ]);
  });

  it('writes codes the database will accept', () => {
    for (const row of salesTaxRows(registration, true)) expect(row.code).toMatch(CODE_SHAPE);
    expect(cityJurisdictionCode('CO', 'Cañón City')).toBe('US-CO-CANON-CITY');
    expect(cityJurisdictionCode('CO', 'Cañón City')).toMatch(CODE_SHAPE);
  });

  it('drops the cities when the firm answered that none collects one', () => {
    // A city typed and then retracted must not reach the client's portal —
    // the same rule the DBA pair gets from a CHECK constraint.
    expect(salesTaxRows({ ...registration, hasCityTax: false }, true)).toEqual([
      { level: 'state', name: 'Illinois', code: 'US-IL' },
    ]);
  });

  it('is empty when the module is off, or when no state was chosen', () => {
    expect(salesTaxRows(registration, false)).toEqual([]);
    expect(salesTaxRows({ ...registration, state: '' }, true)).toEqual([]);
  });

  it('collapses two spellings of one city instead of writing a row the unique key refuses', () => {
    const rows = salesTaxRows({ state: 'MO', hasCityTax: true, cities: ['St. Louis', 'St Louis'] }, true);
    expect(rows.filter((row) => row.level === 'local')).toEqual([
      { level: 'local', name: 'St. Louis', code: 'US-MO-ST-LOUIS' },
    ]);
  });

  it('skips a name nothing survives of', () => {
    expect(citySlug('   ')).toBeNull();
    expect(citySlug('—')).toBeNull();
    expect(salesTaxRows({ state: 'IL', hasCityTax: true, cities: ['—', ''] }, true)).toEqual([
      { level: 'state', name: 'Illinois', code: 'US-IL' },
    ]);
  });
});
