// The Expenses page keeps its whole state in the URL so a filtered view can be
// shared, bookmarked and reached by the back button. Search params are client
// input, so they are validated here with Zod before they reach a query, and an
// unusable value falls back to the default rather than erroring the page.
import { z } from 'zod';

import { toCents } from '@/lib/money';

import { type ExpenseFilters, NO_EXPENSE_FILTERS } from './expenses';

export const EXPENSE_SORTS = ['date_desc', 'date_asc', 'amount_desc', 'amount_asc'] as const;
export type ExpenseSort = (typeof EXPENSE_SORTS)[number];

export const EXPENSE_PAGE_SIZE = 25;

const uuid = z.string().uuid();
const amount = z
  .string()
  .trim()
  .min(1)
  .transform((value, ctx) => {
    try {
      return toCents(value);
    } catch {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'not_an_amount' });
      return z.NEVER;
    }
  })
  .refine((cents) => cents >= 0);

const text = z.string().trim().min(1).max(200);
const recurringFlag = z.enum(['yes', 'no']);
const sortValue = z.enum(EXPENSE_SORTS);
const pageNumber = z.coerce.number().int().min(1).max(10_000);

export type ExpenseQuery = {
  filters: ExpenseFilters;
  sort: ExpenseSort;
  page: number;
};

export type ExpenseSearchParams = Record<string, string | string[] | undefined>;

/** Field-by-field so one bad param (a typo, a stale link) never discards the rest. */
export function parseExpenseQuery(params: ExpenseSearchParams): ExpenseQuery {
  const read = <T>(key: string, schema: z.ZodType<T>): T | null => {
    const raw = params[key];
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (value === undefined || value === '') return null;
    const result = schema.safeParse(value);
    return result.success ? result.data : null;
  };
  const min = read('min', amount);
  const max = read('max', amount);
  const recurring = read('recurring', recurringFlag);
  return {
    filters: {
      ...NO_EXPENSE_FILTERS,
      categoryId: read('category', uuid),
      vendor: read('vendor', text),
      bankAccountId: read('account', uuid),
      recurring: recurring === null ? null : recurring === 'yes',
      search: read('q', text),
      minCents: min,
      // An inverted range would silently return nothing; drop the upper bound instead.
      maxCents: max !== null && min !== null && max < min ? null : max,
    },
    sort: read('sort', sortValue) ?? 'date_desc',
    page: read('page', pageNumber) ?? 1,
  };
}

/** The current query as a query string, with `changes` applied. Paging resets on every other change. */
export function expenseHref(
  base: string,
  params: ExpenseSearchParams,
  changes: Record<string, string | null>,
): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    const first = Array.isArray(value) ? value[0] : value;
    if (first !== undefined && first !== '') search.set(key, first);
  }
  for (const [key, value] of Object.entries(changes)) {
    if (value === null) search.delete(key);
    else search.set(key, value);
  }
  if (!('page' in changes)) search.delete('page');
  const query = search.toString();
  return query ? `${base}?${query}` : base;
}

export function sortTransactions<T extends { date: string; amountCents: number; id: string }>(
  txns: readonly T[],
  sort: ExpenseSort,
): T[] {
  const byId = (a: T, b: T) => a.id.localeCompare(b.id);
  const compare: Record<ExpenseSort, (a: T, b: T) => number> = {
    date_desc: (a, b) => (a.date === b.date ? byId(a, b) : b.date.localeCompare(a.date)),
    date_asc: (a, b) => (a.date === b.date ? byId(a, b) : a.date.localeCompare(b.date)),
    amount_desc: (a, b) => (a.amountCents === b.amountCents ? byId(a, b) : b.amountCents - a.amountCents),
    amount_asc: (a, b) => (a.amountCents === b.amountCents ? byId(a, b) : a.amountCents - b.amountCents),
  };
  return [...txns].sort(compare[sort]);
}
