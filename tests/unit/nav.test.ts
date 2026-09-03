import { describe, expect, it } from 'vitest';

import { BOTTOM_NAV_ITEMS, NAV_ITEMS, clientNavItems, currentNavLabelKey, isActiveNav } from '@/lib/nav';

describe('isActiveNav', () => {
  it('activates on an exact path match (a statement sub-item)', () => {
    expect(isActiveNav('/statements/profit-and-loss', '/statements/profit-and-loss')).toBe(true);
  });

  it('activates the parent on a sub-route (Financial Statements stays lit on a statement)', () => {
    expect(isActiveNav('/statements/profit-and-loss', '/statements')).toBe(true);
  });

  it('does NOT activate on a prefix false-positive (sibling sharing a prefix)', () => {
    expect(isActiveNav('/statements-foo', '/statements')).toBe(false);
    expect(isActiveNav('/dashboard-x', '/dashboard')).toBe(false);
  });

  it('does NOT activate on an unrelated route', () => {
    expect(isActiveNav('/settings', '/statements')).toBe(false);
  });
});

describe('NAV_ITEMS', () => {
  it('follows the INITIAL_PROMPT.md §7 order', () => {
    expect(NAV_ITEMS.map((i) => i.labelKey)).toEqual([
      'overview',
      'statements',
      'expenses',
      'incomeTaxes',
      'salesTaxes',
      'nick',
    ]);
    expect(BOTTOM_NAV_ITEMS.map((i) => i.labelKey)).toEqual(['settings', 'help']);
  });

  it('only links to routes that exist — everything else is disabled, never a dead link', () => {
    const live = NAV_ITEMS.filter((i) => !i.disabled && !i.children).map((i) => i.href);
    expect(live).toEqual(['/dashboard', '/expenses', '/taxes/income', '/taxes/sales', '/chat']);
    expect(BOTTOM_NAV_ITEMS.every((i) => !i.disabled)).toBe(true);
    const liveChildren = NAV_ITEMS.flatMap((i) => i.children ?? []).filter((c) => !c.disabled);
    expect(liveChildren.map((c) => c.href)).toEqual([
      '/statements/profit-and-loss',
      '/statements/balance-sheet',
    ]);
  });

  it('hides Sales Taxes for a business the firm has not enabled the module for', () => {
    expect(clientNavItems(true).map((i) => i.href)).toEqual(NAV_ITEMS.map((i) => i.href));
    expect(clientNavItems(false).map((i) => i.href)).not.toContain('/taxes/sales');
    // Nothing else moves: hiding one module must not reorder the rest.
    expect(clientNavItems(false).map((i) => i.href)).toEqual(['/dashboard', '/statements', '/expenses', '/taxes/income', '/chat']);
  });
});

describe('currentNavLabelKey', () => {
  const items = [...NAV_ITEMS, ...BOTTOM_NAV_ITEMS];

  it('names the deepest entry the path is inside', () => {
    expect(currentNavLabelKey('/dashboard', items)).toBe('overview');
    expect(currentNavLabelKey('/expenses', items)).toBe('expenses');
    expect(currentNavLabelKey('/taxes/sales', items)).toBe('salesTaxes');
    // A child wins over its parent, so the bar reads "Profit & Loss".
    expect(currentNavLabelKey('/statements/profit-and-loss', items)).toBe('statementsPnl');
    expect(currentNavLabelKey('/statements', items)).toBe('statements');
    expect(currentNavLabelKey('/settings/profile', items)).toBe('settings');
  });

  it('returns null for a route no nav entry covers, rather than naming the wrong page', () => {
    expect(currentNavLabelKey('/reports', items)).toBeNull();
    expect(currentNavLabelKey('/statements-archive', items)).toBeNull();
  });
});
