// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { NAV_ITEMS, breadcrumbFor } from '@/lib/nav';
import { PACKAGE_MODULES } from '@/lib/portal/modules';
import { clientNavItems } from '@/lib/nav';

const trail = (path: string, items = NAV_ITEMS) =>
  breadcrumbFor(path, items).map((crumb) => crumb.labelKey);

describe('breadcrumbFor', () => {
  it('names only the root on the Overview, which is the root', () => {
    expect(breadcrumbFor('/dashboard', NAV_ITEMS)).toEqual([{ labelKey: 'breadcrumbRoot' }]);
  });

  it('walks through a nav group to the page inside it', () => {
    expect(trail('/statements/profit-and-loss')).toEqual([
      'breadcrumbRoot',
      'statements',
      'statementsPnl',
    ]);
    expect(trail('/statements/balance-sheet')).toEqual([
      'breadcrumbRoot',
      'statements',
      'statementsBalanceSheet',
    ]);
  });

  it('is two deep for a top-level page', () => {
    expect(trail('/taxes/sales')).toEqual(['breadcrumbRoot', 'salesTaxes']);
    expect(trail('/expenses')).toEqual(['breadcrumbRoot', 'expenses']);
  });

  it('links the root and nothing else — the last crumb is where you are', () => {
    const crumbs = breadcrumbFor('/expenses', NAV_ITEMS);
    expect(crumbs[0]?.href).toBe('/dashboard');
    expect(crumbs.at(-1)?.href).toBeUndefined();
  });

  it('leaves the grouping crumb unlinked, because no route serves it', () => {
    const crumbs = breadcrumbFor('/statements/profit-and-loss', NAV_ITEMS);
    expect(crumbs[1]?.labelKey).toBe('statements');
    expect(crumbs[1]?.href).toBeUndefined();
  });

  it('falls back to the root on a route the nav does not cover', () => {
    expect(trail('/settings/privacy')).toEqual(['breadcrumbRoot']);
    expect(trail('/help')).toEqual(['breadcrumbRoot']);
  });

  it('cannot name a module the firm did not sell', () => {
    // The nav list is already filtered, and the trail is derived from it.
    const salesOnly = clientNavItems(PACKAGE_MODULES.sales_tax);
    expect(trail('/expenses', salesOnly)).toEqual(['breadcrumbRoot']);
    expect(trail('/taxes/sales', salesOnly)).toEqual(['breadcrumbRoot', 'salesTaxes']);
  });
});
