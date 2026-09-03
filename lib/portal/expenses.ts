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

// PostgREST treats % and _ as wildcards and , as a filter separator: escape
// them so a client's search text can never widen or reshape the query.
function escapeLike(value: string): string {
  return value.replace(/[\\%_,()]/g, (match) => `\\${match}`);
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

/**
 * Debits in `range` for one currency, oldest first, with the filters applied in
 * SQL so the page's cards, charts and table all describe the same set.
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
    let query = supabase
      .from('bank_transactions')
      .select(TXN_COLUMNS)
      .eq('business_entity_id', entityId)
      .eq('bank_statements.status', 'published')
      .eq('bank_accounts.currency', currency)
      .not('debit', 'is', null)
      .gt('debit', 0)
      .gte('txn_date', range.start)
      .lte('txn_date', range.end)
      .order('txn_date')
      .order('id')
      .range(from, from + PAGE_SIZE - 1);
    if (filters.categoryId) query = query.eq('category_id', filters.categoryId);
    if (filters.vendor) query = query.eq('vendor', filters.vendor);
    if (filters.bankAccountId) query = query.eq('bank_account_id', filters.bankAccountId);
    if (filters.recurring !== null) query = query.is('is_recurring', filters.recurring);
    if (filters.search) query = query.ilike('description', `%${escapeLike(filters.search)}%`);
    if (filters.minCents !== null) query = query.gte('debit', filters.minCents / 100);
    if (filters.maxCents !== null) query = query.lte('debit', filters.maxCents / 100);
    const { data, error } = await query;
    if (error) throw readError('portal_expenses_read_failed');
    rows.push(...((data ?? []) as TxnRow[]));
    if ((data ?? []).length < PAGE_SIZE) break;
  }
  return rows.map((row) => ({
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
  }));
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
 * Distinct vendors that appear on debits in `range`, for the filter facet.
 * Narrow on purpose: one text column, so offering the choices costs far less
 * than re-reading the rows, and the list stays complete whatever else is
 * filtered.
 */
export async function loadExpenseVendors(
  supabase: Db,
  entityId: string,
  currency: string,
  range: { start: string; end: string },
): Promise<string[]> {
  const vendors = new Set<string>();
  for (let from = 0; from < MAX_ROWS; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('bank_transactions')
      .select('vendor, bank_statements!inner(status), bank_accounts!inner(currency)')
      .eq('business_entity_id', entityId)
      .eq('bank_statements.status', 'published')
      .eq('bank_accounts.currency', currency)
      .not('vendor', 'is', null)
      .not('debit', 'is', null)
      .gte('txn_date', range.start)
      .lte('txn_date', range.end)
      .order('vendor')
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw readError('portal_expense_vendors_read_failed');
    for (const row of data ?? []) if (row.vendor) vendors.add(row.vendor);
    if ((data ?? []).length < PAGE_SIZE) break;
  }
  return [...vendors].sort((a, b) => a.localeCompare(b));
}
