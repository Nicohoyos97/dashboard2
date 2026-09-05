// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { PACKAGE_MODULES, hasAnyModule, packageOf, portalModules } from '@/lib/portal/modules';

describe('service packages', () => {
  it('bookkeeping is everything except sales taxes', () => {
    expect(PACKAGE_MODULES.bookkeeping).toEqual({
      bookkeeping: true,
      income_taxes: true,
      sales_taxes: false,
    });
  });

  it('sales tax is only sales taxes', () => {
    expect(PACKAGE_MODULES.sales_tax).toEqual({
      bookkeeping: false,
      income_taxes: false,
      sales_taxes: true,
    });
  });

  it('full is both', () => {
    expect(PACKAGE_MODULES.full).toEqual({
      bookkeeping: true,
      income_taxes: true,
      sales_taxes: true,
    });
  });

  it('names the package a selection matches, and admits a custom mix', () => {
    expect(packageOf(PACKAGE_MODULES.bookkeeping)).toBe('bookkeeping');
    expect(packageOf(PACKAGE_MODULES.sales_tax)).toBe('sales_tax');
    expect(packageOf(PACKAGE_MODULES.full)).toBe('full');
    expect(packageOf({ ...PACKAGE_MODULES.bookkeeping, income_taxes: false })).toBeNull();
  });
});

describe('portalModules', () => {
  it('reads sales taxes from its own column, not from the json', () => {
    // sales_tax_enabled is the column guard_entity_firm_columns protects and
    // every existing route already gates on; keeping it authoritative is what
    // stops the nav and the URL from disagreeing.
    const row = { sales_tax_enabled: true, enabled_modules: { sales_taxes: false } };
    expect(portalModules(row).sales_taxes).toBe(true);
  });

  it('reads a pre-0019 row through its old `statements` key', () => {
    // The 0019 backfill renames it, but a row written by an older deploy — or
    // restored from a backup — must still resolve to what the firm sold rather
    // than silently defaulting the books back on.
    const off = { sales_tax_enabled: true, enabled_modules: { statements: false, expenses: false } };
    expect(portalModules(off).bookkeeping).toBe(false);
    const on = { sales_tax_enabled: false, enabled_modules: { statements: true, expenses: false } };
    expect(portalModules(on).bookkeeping).toBe(true);
  });

  it('prefers the new key when a row carries both', () => {
    const row = {
      sales_tax_enabled: false,
      enabled_modules: { bookkeeping: false, statements: true },
    };
    expect(portalModules(row).bookkeeping).toBe(false);
  });

  it('keeps a page a business was already seeing when the key is missing', () => {
    const legacy = { sales_tax_enabled: false, enabled_modules: { income_taxes: true } };
    expect(portalModules(legacy)).toEqual({
      bookkeeping: true,
      income_taxes: true,
      sales_taxes: false,
    });
  });

  it('turns a module off only when it is explicitly false', () => {
    const row = {
      sales_tax_enabled: true,
      enabled_modules: { bookkeeping: false, income_taxes: false },
    };
    expect(portalModules(row)).toEqual(PACKAGE_MODULES.sales_tax);
  });

  it('survives a null or malformed column', () => {
    expect(portalModules({ sales_tax_enabled: null, enabled_modules: null })).toEqual(
      PACKAGE_MODULES.bookkeeping,
    );
    expect(portalModules({ sales_tax_enabled: false, enabled_modules: 'nonsense' })).toEqual(
      PACKAGE_MODULES.bookkeeping,
    );
  });

  it('knows when a business has nothing enabled', () => {
    expect(hasAnyModule(PACKAGE_MODULES.sales_tax)).toBe(true);
    expect(hasAnyModule({ bookkeeping: false, income_taxes: false, sales_taxes: false })).toBe(false);
  });
});
