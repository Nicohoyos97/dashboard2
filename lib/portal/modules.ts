// What a business bought, and therefore what its portal shows.
//
// The firm sells two things — bookkeeping and sales tax — and a client may have
// either or both. Nick comes with all of them: an assistant that cannot answer
// about the one module you pay for would be worse than no assistant, so it is
// not a switch. Its *tools* still follow the modules (lib/ai/nick/tools), or a
// sales-tax-only client could ask it about a Profit & Loss they cannot open.
//
// Storage is split for a reason: `sales_tax_enabled` is its own column, already
// load-bearing and protected by guard_entity_firm_columns, and the rest live in
// `enabled_modules`. Reading them through this one helper is what keeps the nav,
// the route guards, the Overview and Nick from disagreeing — before it, the
// portal read only sales_tax_enabled and the other two switches did nothing.

export const PORTAL_MODULES = ['statements', 'expenses', 'income_taxes', 'sales_taxes'] as const;
export type PortalModule = (typeof PORTAL_MODULES)[number];
export type PortalModules = Record<PortalModule, boolean>;

export const SERVICE_PACKAGES = ['bookkeeping', 'sales_tax', 'full'] as const;
export type ServicePackage = (typeof SERVICE_PACKAGES)[number];

/** What each package turns on. Anything else is a custom selection. */
export const PACKAGE_MODULES: Record<ServicePackage, PortalModules> = {
  // Everything the books produce; sales tax is a separate engagement.
  bookkeeping: { statements: true, expenses: true, income_taxes: true, sales_taxes: false },
  // Only the filings — no statements, no expense breakdown, no income tax.
  sales_tax: { statements: false, expenses: false, income_taxes: false, sales_taxes: true },
  full: { statements: true, expenses: true, income_taxes: true, sales_taxes: true },
};

/**
 * The modules of a business row. Unknown or missing keys default to on, so a
 * row written before a module existed keeps showing what it always showed —
 * losing a page silently is worse than showing one the firm has to turn off.
 */
export function portalModules(row: {
  sales_tax_enabled: boolean | null;
  enabled_modules: unknown;
}): PortalModules {
  const stored = (row.enabled_modules ?? {}) as Record<string, unknown>;
  const on = (key: string): boolean => stored[key] !== false;
  return {
    statements: on('statements'),
    expenses: on('expenses'),
    income_taxes: on('income_taxes'),
    sales_taxes: row.sales_tax_enabled === true,
  };
}

/** The package a selection corresponds to, or null when it is a custom mix. */
export function packageOf(modules: PortalModules): ServicePackage | null {
  const match = SERVICE_PACKAGES.find((name) =>
    PORTAL_MODULES.every((module) => PACKAGE_MODULES[name][module] === modules[module]),
  );
  return match ?? null;
}

/** A business with nothing enabled can still sign in; it just has no modules yet. */
export function hasAnyModule(modules: PortalModules): boolean {
  return PORTAL_MODULES.some((module) => modules[module]);
}
