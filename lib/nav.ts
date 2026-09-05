// Shared top-level navigation for the client portal shell (the (dashboard) group),
// per INITIAL_PROMPT.md §7. Framework-free so isActiveNav stays pure and
// unit-testable; labels are i18n keys resolved in NavList. Items marked
// `disabled` render non-interactive — never a dead link. Sales Taxes is
// visibility-gated by the business's `sales_tax_enabled`: see clientNavItems,
// which the layout calls; the route 404s for the same reason, so the nav and
// the URL always agree. The firm portal's list lives in lib/admin-nav.ts and
// shares these types.
import type { PortalModule, PortalModules } from './portal/modules';

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

/** Which module each nav entry belongs to; the rest (Overview, Nick) are always shown. */
const NAV_MODULE: Record<string, PortalModule> = {
  '/statements': 'bookkeeping',
  '/expenses': 'bookkeeping',
  '/taxes/income': 'income_taxes',
  '/taxes/sales': 'sales_taxes',
};

/**
 * The nav a given business sees. Overview and Nick come with every package;
 * everything else is what the firm sold them. The routes 404 on the same
 * check, so the nav and the URL always agree.
 */
export function clientNavItems(modules: PortalModules): NavItem[] {
  return NAV_ITEMS.filter((item) => {
    const required = NAV_MODULE[item.href];
    return required === undefined || modules[required];
  });
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

/**
 * The trail to the page you are on: "Dashboard › Financial Statements ›
 * Profit & Loss". The root always names the portal itself and links home; a
 * parent that groups children (Financial Statements) is a label rather than a
 * link, because no route serves it; the last crumb is where you already are,
 * so it is not a link either.
 *
 * Derived from the same nav list the sidebar renders, so a module the firm did
 * not sell can never appear in a trail — the list is already filtered.
 */
export type Crumb = { labelKey: string; href?: string };

export const BREADCRUMB_ROOT: Crumb = { labelKey: 'breadcrumbRoot', href: '/dashboard' };

export function breadcrumbFor(pathname: string, items: readonly NavItem[]): Crumb[] {
  if (pathname === '/dashboard') return [{ labelKey: BREADCRUMB_ROOT.labelKey }];

  for (const item of items) {
    for (const child of item.children ?? []) {
      if (isActiveNav(pathname, child.href)) {
        return [BREADCRUMB_ROOT, { labelKey: item.labelKey }, { labelKey: child.labelKey }];
      }
    }
  }
  for (const item of items) {
    if (item.href !== '/dashboard' && isActiveNav(pathname, item.href, item.exact)) {
      return [BREADCRUMB_ROOT, { labelKey: item.labelKey }];
    }
  }
  // A route no nav entry covers (Settings sub-pages, Help): name the root only,
  // rather than guessing a label and being wrong about where the user is.
  return [BREADCRUMB_ROOT];
}
