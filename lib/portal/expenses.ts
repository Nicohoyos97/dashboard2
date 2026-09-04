// Expense loaders for the client portal. Debits on published bank statements
// only — the joined `bank_statements.status` filter matters for a firm preview,
// whose RLS branch can otherwise read drafts. Every query runs on the caller's
// RLS-scoped client and money leaves here as integer cents.
import 'server-only';

import { EXPENSE_KINDS, type ExpenseKind, type ExpenseTxn } from '@/lib/reports/expenses';
import type { createClient } from '@/lib/supabase/server';

type Db = Awaited<ReturnType<typeof createClient>>;

const PAGE_SIZE = 1_000;
/** Ceiling on rows pulled for one period, so a pathological entity cannot exhaust the request. */
const MAX_ROWS = 20_000;

function readError(code: string): Error {
  return new Error(code);
}

const TXN_COLUMNS =
  'id, txn_date, description, debit, vendor, is_recurring, page_number, document_version_id, bank_account_id, category_id, expense_categories (name, kind, is_fixed), bank_statements!inner(status), bank_accounts!inner(currency)';

export type ExpenseFilters = {
  categoryId: string | null;
  vendor: string | null;
  bankAccountId: string | null;
  recurring: boolean | null;
  search: string | null;
  minCents: number | null;
  maxCents: number | null;
};

export const NO_EXPENSE_FILTERS: ExpenseFilters = {
  categoryId: null,
  vendor: null,
  bankAccountId: null,
  recurring: null,
  search: null,
  minCents: null,
  maxCents: null,
};

function kindOf(value: string | null | undefined): ExpenseKind | null {
  return EXPENSE_KINDS.find((kind) => kind === value) ?? null;
}

// PostgREST treats % and _ as wildcards, rewrites * to %, and uses , ( ) as
// filter syntax: escape them all so a client's search text can never widen or
// reshape the query.
function escapeLike(value: string): string {
  return value.replace(/[\\%_*,()]/g, (match) => `\\${match}`);
}

type TxnRow = {
  id: string;
  txn_date: string;
  description: string;
  debit: number | null;
  vendor: string | null;
  is_recurring: boolean | null;
  page_number: number | null;
  document_version_id: string | null;
  bank_account_id: string;
  category_id: string | null;
  expense_categories: { name: string; kind: string; is_fixed: boolean | null } | null;
};

type SortColumn = { column: 'txn_date' | 'debit'; ascending: boolean };

const SORTS: Record<string, SortColumn> = {
  date_desc: { column: 'txn_date', ascending: false },
  date_asc: { column: 'txn_date', ascending: true },
  amount_desc: { column: 'debit', ascending: false },
  amount_asc: { column: 'debit', ascending: true },
};

function applyFilters<T extends { eq: (c: string, v: unknown) => T; is: (c: string, v: unknown) => T; ilike: (c: string, v: string) => T; gte: (c: string, v: unknown) => T; lte: (c: string, v: unknown) => T }>(
  query: T,
  filters: ExpenseFilters,
): T {
  let next = query;
  if (filters.categoryId) next = next.eq('category_id', filters.categoryId);
  if (filters.vendor) next = next.eq('vendor', filters.vendor);
  if (filters.bankAccountId) next = next.eq('bank_account_id', filters.bankAccountId);
  if (filters.recurring !== null) next = next.is('is_recurring', filters.recurring);
  if (filters.search) next = next.ilike('description', `%${escapeLike(filters.search)}%`);
  if (filters.minCents !== null) next = next.gte('debit', filters.minCents / 100);
  if (filters.maxCents !== null) next = next.lte('debit', filters.maxCents / 100);
  return next;
}

/**
 * One page of the transaction table, ordered and counted by Postgres. The page
 * never holds more than `pageSize` rows: the figures above the table come from
 * `loadExpenseSummary`, not from counting these.
 */
export async function loadExpensePage(
  supabase: Db,
  entityId: string,
  currency: string,
  range: { start: string; end: string },
  filters: ExpenseFilters,
  sort: string,
  page: number,
  pageSize: number,
): Promise<{ rows: ExpenseTxn[]; total: number }> {
  const order = SORTS[sort] ?? SORTS.date_desc;
  if (!order) throw readError('portal_expenses_read_failed');
  const from = (page - 1) * pageSize;
  const query = applyFilters(
    supabase
      .from('bank_transactions')
      .select(TXN_COLUMNS, { count: 'exact' })
      .eq('business_entity_id', entityId)
      .eq('bank_statements.status', 'published')
      .eq('bank_accounts.currency', currency)
      .not('debit', 'is', null)
      .gt('debit', 0)
      .gte('txn_date', range.start)
      .lte('txn_date', range.end),
    filters,
  )
    .order(order.column, { ascending: order.ascending })
    .order('id')
    .range(from, from + pageSize - 1);
  const { data, error, count } = await query;
  if (error) throw readError('portal_expenses_read_failed');
  return { rows: ((data ?? []) as TxnRow[]).map(toExpenseTxn), total: count ?? 0 };
}

/**
 * Every debit in `range`, for the CSV export only — an export is the one place
 * that genuinely needs the whole set. Everything on screen reads aggregates
 * (`loadExpenseSummary`) or one page (`loadExpensePage`).
 */
export async function loadExpenseTransactions(
  supabase: Db,
  entityId: string,
  currency: string,
  range: { start: string; end: string },
  filters: ExpenseFilters = NO_EXPENSE_FILTERS,
): Promise<ExpenseTxn[]> {
  const rows: TxnRow[] = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE_SIZE) {
    const { data, error } = await applyFilters(
      supabase
        .from('bank_transactions')
        .select(TXN_COLUMNS)
        .eq('business_entity_id', entityId)
        .eq('bank_statements.status', 'published')
        .eq('bank_accounts.currency', currency)
        .not('debit', 'is', null)
        .gt('debit', 0)
        .gte('txn_date', range.start)
        .lte('txn_date', range.end),
      filters,
    )
      .order('txn_date')
      .order('id')
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw readError('portal_expenses_read_failed');
    rows.push(...((data ?? []) as TxnRow[]));
    if ((data ?? []).length < PAGE_SIZE) break;
  }
  return rows.map(toExpenseTxn);
}

function toExpenseTxn(row: TxnRow): ExpenseTxn {
  return {
    id: row.id,
    date: row.txn_date,
    description: row.description,
    vendor: row.vendor,
    categoryId: row.category_id,
    categoryName: row.expense_categories?.name ?? null,
    categoryKind: kindOf(row.expense_categories?.kind),
    categoryIsFixed: row.expense_categories?.is_fixed ?? null,
    bankAccountId: row.bank_account_id,
    isRecurring: row.is_recurring,
    amountCents: Math.round((row.debit ?? 0) * 100),
    pageNumber: row.page_number,
    documentVersionId: row.document_version_id,
  };
}

export type ExpenseCategoryOption = { id: string; name: string; kind: ExpenseKind };
export type BankAccountOption = { id: string; label: string; currency: string };

export async function loadExpenseCategories(supabase: Db, entityId: string): Promise<ExpenseCategoryOption[]> {
  const { data, error } = await supabase
    .from('expense_categories')
    .select('id, name, kind')
    .eq('business_entity_id', entityId)
    .order('name');
  if (error) throw readError('portal_expense_categories_read_failed');
  return (data ?? []).map((row) => ({ id: row.id, name: row.name, kind: kindOf(row.kind) ?? 'other' }));
}

/** Accounts are labelled "Institution ••••1234" — the masked number is all we ever store. */
export async function loadBankAccounts(supabase: Db, entityId: string): Promise<BankAccountOption[]> {
  const { data, error } = await supabase
    .from('bank_accounts')
    .select('id, institution, masked_number, currency')
    .eq('business_entity_id', entityId)
    .order('institution');
  if (error) throw readError('portal_bank_accounts_read_failed');
  return (data ?? []).map((row) => ({
    id: row.id,
    label: `${row.institution} ${row.masked_number}`,
    currency: row.currency,
  }));
}

/**
 * Distinct vendors on debits in `range`, for the filter facet — a DISTINCT in
 * Postgres rather than a third full scan of the rows (migration 0011).
 */
export async function loadExpenseVendors(
  supabase: Db,
  entityId: string,
  currency: string,
  range: { start: string; end: string },
): Promise<string[]> {
  const { data, error } = await supabase.rpc('portal_expense_vendors', {
    p_entity: entityId,
    p_currency: currency,
    p_start: range.start,
    p_end: range.end,
  });
  if (error) throw readError('portal_expense_vendors_read_failed');
  return (data ?? []).flatMap((row) => (row.vendor === null ? [] : [row.vendor]));
}

export type ExpenseSummary = {
  totalCents: number;
  count: number;
  byKind: Record<ExpenseKind, number>;
  uncategorizedCents: number;
  recurring: { yesCents: number; noCents: number; unknownCents: number };
  fixed: { yesCents: number; noCents: number; unknownCents: number };
  byCategory: { key: string; label: string | null; cents: number; count: number }[];
  byVendor: { key: string; label: string | null; cents: number; count: number }[];
  byMonth: { month: string; cents: number }[];
};

type Split = { yes?: number; no?: number; unknown?: number };
type SummaryPayload = {
  total_cents?: number;
  count?: number;
  uncategorized_cents?: number;
  by_kind?: Partial<Record<string, number>>;
  recurring?: Split;
  fixed?: Split;
  by_category?: { key: string; label: string | null; cents: number; count: number }[];
  by_vendor?: { key: string; label: string | null; cents: number; count: number }[];
  by_month?: { month: string; cents: number }[];
};

function split(value: Split | undefined): { yesCents: number; noCents: number; unknownCents: number } {
  return { yesCents: value?.yes ?? 0, noCents: value?.no ?? 0, unknownCents: value?.unknown ?? 0 };
}

/**
 * Every figure above the transaction table, grouped by Postgres in one call:
 * totals by kind, the recurring and fixed splits, the top categories and
 * vendors, and the month series. Filters are applied inside the function, so
 * the cards, the charts and the table all describe the same set.
 */
export async function loadExpenseSummary(
  supabase: Db,
  entityId: string,
  currency: string,
  range: { start: string; end: string },
  filters: ExpenseFilters = NO_EXPENSE_FILTERS,
): Promise<ExpenseSummary> {
  const { data, error } = await supabase.rpc('portal_expense_summary', {
    p_entity: entityId,
    p_currency: currency,
    p_start: range.start,
    p_end: range.end,
    // The generated argument types are optional rather than nullable, and the
    // function's own defaults are null, so an absent filter is simply omitted.
    ...(filters.categoryId ? { p_category: filters.categoryId } : {}),
    ...(filters.vendor ? { p_vendor: filters.vendor } : {}),
    ...(filters.bankAccountId ? { p_account: filters.bankAccountId } : {}),
    ...(filters.recurring !== null ? { p_recurring: filters.recurring } : {}),
    // Raw: the function escapes LIKE's metacharacters itself (0012), and its
    // rules differ from PostgREST's `.ilike()` above, which also treats `*` as `%`.
    ...(filters.search !== null ? { p_search: filters.search } : {}),
    ...(filters.minCents !== null ? { p_min: filters.minCents / 100 } : {}),
    ...(filters.maxCents !== null ? { p_max: filters.maxCents / 100 } : {}),
  });
  if (error) throw readError('portal_expense_summary_read_failed');
  const payload = (data ?? {}) as SummaryPayload;
  const byKind = Object.fromEntries(EXPENSE_KINDS.map((kind) => [kind, payload.by_kind?.[kind] ?? 0])) as Record<ExpenseKind, number>;
  return {
    totalCents: payload.total_cents ?? 0,
    count: payload.count ?? 0,
    byKind,
    uncategorizedCents: payload.uncategorized_cents ?? 0,
    recurring: split(payload.recurring),
    fixed: split(payload.fixed),
    byCategory: payload.by_category ?? [],
    byVendor: payload.by_vendor ?? [],
    byMonth: payload.by_month ?? [],
  };
}
