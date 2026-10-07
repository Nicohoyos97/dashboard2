// What a business bought, and therefore what its portal shows.
//
// The firm sells two base services — bookkeeping and sales tax — and a client
// may have either or both. On top of them sit two add-ons, each priced on its
// own (owner, 2026-10-07): the Balance Sheet, which only means something beside
// the books, and income taxes. The firm picks them when it creates the client. Bookkeeping is one engagement, not two: a client who gets the
// Profit & Loss also gets the expense breakdown that explains it, so `statements`
// and `expenses` collapsed into `bookkeeping` in 0019. Nick comes with all of
// them: an assistant that cannot answer about the one module you pay for would
// be worse than no assistant, so it is not a switch. Its *tools* still follow
// the modules (lib/ai/nick/tools), or a sales-tax-only client could ask it
// about a Profit & Loss they cannot open.
//
// `balance_sheet` resolves to false whenever `bookkeeping` is off, here and
// nowhere else, so every reader checks one flag instead of remembering the pair.
//
// Storage is split for a reason: `sales_tax_enabled` is its own column, already
// load-bearing and protected by guard_entity_firm_columns, and the rest live in
// `enabled_modules`. Reading them through this one helper is what keeps the nav,
// the route guards, the Overview and Nick from disagreeing.

export const PORTAL_MODULES = ['bookkeeping', 'balance_sheet', 'income_taxes', 'sales_taxes'] as const;
export type PortalModule = (typeof PORTAL_MODULES)[number];
export type PortalModules = Record<PortalModule, boolean>;

export const SERVICE_PACKAGES = ['bookkeeping', 'sales_tax', 'full'] as const;
export type ServicePackage = (typeof SERVICE_PACKAGES)[number];

/** The services a package is made of; the add-ons are sold on top of any of them. */
export const BASE_MODULES = ['bookkeeping', 'sales_taxes'] as const satisfies readonly PortalModule[];
export const ADDON_MODULES = ['balance_sheet', 'income_taxes'] as const satisfies readonly PortalModule[];

/** What each package turns on. A package never includes an add-on. */
export const PACKAGE_MODULES: Record<ServicePackage, PortalModules> = {
  // The Profit & Loss and the expense breakdown that explains it.
  bookkeeping: { bookkeeping: true, balance_sheet: false, income_taxes: false, sales_taxes: false },
  // Only the filings — no statements, no expense breakdown.
  sales_tax: { bookkeeping: false, balance_sheet: false, income_taxes: false, sales_taxes: true },
  full: { bookkeeping: true, balance_sheet: false, income_taxes: false, sales_taxes: true },
};

/** Every page there is — what the shell falls back to before a business resolves. */
export const ALL_MODULES: PortalModules = { bookkeeping: true, balance_sheet: true, income_taxes: true, sales_taxes: true };

/**
 * The modules of a business row. Unknown or missing keys default to on, so a
 * row written before a module existed keeps showing what it always showed —
 * losing a page silently is worse than showing one the firm has to turn off.
 * `statements` is read as a fallback for `bookkeeping` so a row the 0019
 * backfill has not reached still resolves to what the firm sold.
 */
export function portalModules(row: {
  sales_tax_enabled: boolean | null;
  enabled_modules: unknown;
}): PortalModules {
  // A column that is null, a string, or anything else that is not an object
  // reads as "nothing recorded", which defaults every module on rather than
  // taking a live client's pages away over a malformed row.
  const raw: unknown = row.enabled_modules;
  const stored: Record<string, unknown> =
    typeof raw === 'object' && raw !== null && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const on = (key: string): boolean => stored[key] !== false;
  const bookkeeping = 'bookkeeping' in stored ? on('bookkeeping') : on('statements');
  return {
    bookkeeping,
    balance_sheet: bookkeeping && on('balance_sheet'),
    income_taxes: on('income_taxes'),
    sales_taxes: row.sales_tax_enabled === true,
  };
}

/**
 * The package a selection is built on, or null when it has no base service at
 * all. Add-ons do not change the answer: bookkeeping with income taxes on top
 * is still the bookkeeping package.
 */
export function packageOf(modules: PortalModules): ServicePackage | null {
  const match = SERVICE_PACKAGES.find((name) =>
    BASE_MODULES.every((module) => PACKAGE_MODULES[name][module] === modules[module]),
  );
  return match ?? null;
}

/** A business with nothing enabled can still sign in; it just has no modules yet. */
export function hasAnyModule(modules: PortalModules): boolean {
  return PORTAL_MODULES.some((module) => modules[module]);
}
