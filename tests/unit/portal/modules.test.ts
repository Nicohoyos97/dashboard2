// @vitest-environment node
import { describe, expect, it } from 'vitest';

import {
  PACKAGE_MODULES,
  hasAnyModule,
  packageOf,
  portalModules,
} from '@/lib/portal/modules';

describe('service packages', () => {
  it('bookkeeping is everything except sales taxes', () => {
    expect(PACKAGE_MODULES.bookkeeping).toEqual({
      statements: true,
      expenses: true,
      income_taxes: true,
      sales_taxes: false,
    });
  });

  it('sales tax is only sales taxes', () => {
    expect(PACKAGE_MODULES.sales_tax).toEqual({
      statements: false,
      expenses: false,
      income_taxes: false,
      sales_taxes: true,
    });
  });

  it('full is both', () => {
    expect(PACKAGE_MODULES.full).toEqual({
      statements: true,
      expenses: true,
      income_taxes: true,
      sales_taxes: true,
    });
  });

  it('names the package a selection matches, and admits a custom mix', () => {
    expect(packageOf(PACKAGE_MODULES.bookkeeping)).toBe('bookkeeping');
    expect(packageOf(PACKAGE_MODULES.sales_tax)).toBe('sales_tax');
    expect(packageOf(PACKAGE_MODULES.full)).toBe('full');
    expect(packageOf({ ...PACKAGE_MODULES.bookkeeping, expenses: false })).toBeNull();
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

  it('keeps a page a business was already seeing when the key is missing', () => {
    // Rows written before `statements` existed must not lose the statements.
    const legacy = { sales_tax_enabled: false, enabled_modules: { expenses: true, income_taxes: true } };
    expect(portalModules(legacy)).toEqual({
      statements: true,
      expenses: true,
      income_taxes: true,
      sales_taxes: false,
    });
  });

  it('turns a module off only when it is explicitly false', () => {
    const row = { sales_tax_enabled: true, enabled_modules: { statements: false, expenses: false, income_taxes: false } };
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
    expect(hasAnyModule({ statements: false, expenses: false, income_taxes: false, sales_taxes: false })).toBe(false);
  });
});
