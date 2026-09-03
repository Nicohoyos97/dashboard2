import { describe, expect, it } from 'vitest';

import { NAV_ITEMS, isActiveNav } from '@/lib/nav';

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
      'settings',
    ]);
  });

  it('only links to routes that exist — everything else is disabled, never a dead link', () => {
    const live = NAV_ITEMS.filter((i) => !i.disabled && !i.children).map((i) => i.href);
    expect(live).toEqual(['/dashboard', '/settings']);
    const liveChildren = NAV_ITEMS.flatMap((i) => i.children ?? []).filter((c) => !c.disabled);
    expect(liveChildren.map((c) => c.href)).toEqual(['/statements/profit-and-loss', '/statements/balance-sheet']);
  });
});
