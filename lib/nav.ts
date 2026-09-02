// Shared top-level navigation for the client portal shell (the (dashboard) group),
// per INITIAL_PROMPT.md §7. Framework-free so isActiveNav stays pure and
// unit-testable; labels are i18n keys resolved in NavList. Items marked
// `disabled` are not built yet (Phases 3–5) and render non-interactive — never a
// dead link. Sales Taxes additionally becomes visibility-gated by
// `sales_tax_enabled` once the module ships (Phase 5). The firm portal's list
// lives in lib/admin-nav.ts and shares these types.
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
};

export const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', labelKey: 'overview' },
  {
    href: '/statements',
    labelKey: 'statements',
    children: [
      { href: '/statements/profit-and-loss', labelKey: 'statementsPnl', disabled: true },
      { href: '/statements/balance-sheet', labelKey: 'statementsBalanceSheet', disabled: true },
    ],
  },
  { href: '/expenses', labelKey: 'expenses', disabled: true },
  { href: '/taxes/income', labelKey: 'incomeTaxes', disabled: true },
  { href: '/taxes/sales', labelKey: 'salesTaxes', disabled: true },
  { href: '/chat', labelKey: 'nick', disabled: true },
  { href: '/settings', labelKey: 'settings' },
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
