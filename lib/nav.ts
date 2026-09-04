// Shared top-level navigation for the client portal shell (the (dashboard) group),
// per INITIAL_PROMPT.md §7. Framework-free so isActiveNav stays pure and
// unit-testable; labels are i18n keys resolved in NavList. Items marked
// `disabled` render non-interactive — never a dead link. Sales Taxes is
// visibility-gated by the business's `sales_tax_enabled`: see clientNavItems,
// which the layout calls; the route 404s for the same reason, so the nav and
// the URL always agree. The firm portal's list lives in lib/admin-nav.ts and
// shares these types.
export type NavChild = {
  href: string;
  labelKey: string;
  disabled?: boolean;
};

export type NavItem = {
  href: string;
  labelKey: string;
  disabled?: boolean;
  exact?: boolean; // active only on the exact path (a root like /admin)
  children?: NavChild[];
  /** Live count shown beside the label — how the firm learns work is waiting. */
  badge?: number;
};

export const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', labelKey: 'overview' },
  {
    href: '/statements',
    labelKey: 'statements',
    children: [
      { href: '/statements/profit-and-loss', labelKey: 'statementsPnl' },
      { href: '/statements/balance-sheet', labelKey: 'statementsBalanceSheet' },
    ],
  },
  { href: '/expenses', labelKey: 'expenses' },
  { href: '/taxes/income', labelKey: 'incomeTaxes' },
  { href: '/taxes/sales', labelKey: 'salesTaxes' },
  { href: '/chat', labelKey: 'nick' },
];

/** The nav a given business sees: Sales Taxes only when the firm enabled the module for it. */
export function clientNavItems(salesTaxEnabled: boolean): NavItem[] {
  return salesTaxEnabled ? NAV_ITEMS : NAV_ITEMS.filter((item) => item.href !== '/taxes/sales');
}

// Utility links under the user block at the bottom of the sidebar (§7:
// Settings · Profile · Help & FAQs).
export const BOTTOM_NAV_ITEMS: NavItem[] = [
  { href: '/settings', labelKey: 'settings' },
  { href: '/help', labelKey: 'help' },
];

// Active when the path equals the item href OR is a true sub-route (href + "/").
// So the "Financial Statements" parent (/statements) lights up on
// /statements/profit-and-loss, while a child matches exactly. NOT a naive
// startsWith: "/statements-foo" must not activate "/statements". next-intl's
// usePathname returns the locale-stripped path, so the hrefs here are locale-less.
export function isActiveNav(pathname: string, href: string, exact = false): boolean {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * The label key of the nav entry the path is currently inside — the deepest
 * match wins, so /statements/profit-and-loss reads "Profit & Loss" rather than
 * "Financial Statements". Null for a route no nav entry covers, so the caller
 * can fall back rather than showing a wrong page name.
 */
export function currentNavLabelKey(pathname: string, items: readonly NavItem[]): string | null {
  let bestHref = '';
  let bestKey: string | null = null;
  for (const item of items) {
    if (isActiveNav(pathname, item.href, item.exact) && item.href.length > bestHref.length) {
      bestHref = item.href;
      bestKey = item.labelKey;
    }
    for (const child of item.children ?? []) {
      if (isActiveNav(pathname, child.href) && child.href.length > bestHref.length) {
        bestHref = child.href;
        bestKey = child.labelKey;
      }
    }
  }
  return bestKey;
}
