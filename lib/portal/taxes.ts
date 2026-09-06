// Tax loaders for the client portal. Published, non-superseded obligations
// only, on the caller's RLS-scoped client. Money leaves here as integer cents
// and every status the firm set travels with the row — the UI never infers one.
import 'server-only';

import {
  FILING_STATUSES,
  type FilingStatus,
  TAX_STATUSES,
  type TaxJurisdiction,
  type TaxObligation,
  type TaxPayment,
  type TaxStatus,
} from '@/lib/reports/taxes';
import type { createClient } from '@/lib/supabase/server';

type Db = Awaited<ReturnType<typeof createClient>>;

/** Enough history for a year-over-year view without unbounded reads. */
const MAX_OBLIGATIONS = 60;

function readError(code: string): Error {
  return new Error(code);
}

const cents = (value: number | null): number | null => (value === null ? null : Math.round(value * 100));

const OBLIGATION_COLUMNS =
  'id, tax_type, tax_year, period_start, period_end, due_date, filing_status, amount_estimated, amount_confirmed, amount_paid, amount_payable, taxable_sales, non_taxable_sales, tax_collected, status, confirmation_number, notes, source, document_version_id, page_number, tax_jurisdictions (name, level, code, filing_frequency)';

type JurisdictionRow = { name: string; level: string; code: string; filing_frequency: string | null } | null;

type ObligationRow = {
  id: string;
  tax_type: string;
  tax_year: number | null;
  period_start: string | null;
  period_end: string | null;
  due_date: string | null;
  filing_status: string | null;
  amount_estimated: number | null;
  amount_confirmed: number | null;
  amount_paid: number | null;
  amount_payable: number | null;
  taxable_sales: number | null;
  non_taxable_sales: number | null;
  tax_collected: number | null;
  status: string;
  confirmation_number: string | null;
  notes: string | null;
  source: string;
  document_version_id: string | null;
  page_number: number | null;
  tax_jurisdictions: JurisdictionRow;
};

type PaymentRow = {
  id: string;
  obligation_id: string;
  paid_on: string;
  amount: number;
  method: string | null;
  confirmation_number: string | null;
  document_version_id: string | null;
  page_number: number | null;
};

function statusOf(value: string): TaxStatus {
  return TAX_STATUSES.find((status) => status === value) ?? 'pending_review';
}

function filingOf(value: string | null): FilingStatus | null {
  return FILING_STATUSES.find((status) => status === value) ?? null;
}

function jurisdictionOf(row: JurisdictionRow): TaxJurisdiction | null {
  if (!row) return null;
  const level = row.level === 'federal' || row.level === 'state' || row.level === 'local' ? row.level : 'state';
  const frequency =
    row.filing_frequency === 'monthly' || row.filing_frequency === 'quarterly' || row.filing_frequency === 'annual'
      ? row.filing_frequency
      : null;
  return { name: row.name, level, code: row.code, filingFrequency: frequency };
}

export type SalesTaxJurisdiction = { name: string; level: 'state' | 'local' };

/**
 * Where the firm has registered this business to collect sales tax (0024).
 *
 * Named, not counted: the page used to print how many jurisdictions the
 * obligations mentioned — a number that was always 0, because nothing had ever
 * written one, and that told a client nothing they could check against their
 * own registrations. State first, then the cities under it.
 */
export async function loadSalesTaxJurisdictions(
  supabase: Db,
  entityId: string,
): Promise<SalesTaxJurisdiction[]> {
  const { data, error } = await supabase
    .from('tax_jurisdictions')
    .select('name, level')
    .eq('business_entity_id', entityId)
    .eq('tax_type', 'sales')
    .order('level', { ascending: false })
    .order('name');
  if (error) throw readError('portal_sales_tax_jurisdictions_read_failed');
  return (data ?? []).map((row) => ({
    name: row.name,
    level: row.level === 'local' ? 'local' : 'state',
  }));
}

/** Published obligations of one type, newest due date first, with their payments attached. */
export async function loadTaxObligations(
  supabase: Db,
  entityId: string,
  taxType: 'income' | 'sales',
): Promise<TaxObligation[]> {
  const { data, error } = await supabase
    .from('tax_obligations')
    .select(OBLIGATION_COLUMNS)
    .eq('business_entity_id', entityId)
    .eq('tax_type', taxType)
    .not('published_at', 'is', null)
    .is('superseded_by', null)
    .order('due_date', { ascending: false, nullsFirst: false })
    .limit(MAX_OBLIGATIONS);
  if (error) throw readError('portal_tax_obligations_read_failed');
  const rows = (data ?? []) as ObligationRow[];
  if (rows.length === 0) return [];

  const { data: paidData, error: paidError } = await supabase
    .from('tax_payments')
    .select('id, obligation_id, paid_on, amount, method, confirmation_number, document_version_id, page_number')
    .eq('business_entity_id', entityId)
    .not('published_at', 'is', null)
    .in('obligation_id', rows.map((row) => row.id))
    .order('paid_on');
  if (paidError) throw readError('portal_tax_payments_read_failed');
  const payments = (paidData ?? []) as PaymentRow[];

  return rows.map((row) => ({
    id: row.id,
    taxType: row.tax_type === 'sales' ? 'sales' : row.tax_type === 'payroll' ? 'payroll' : 'income',
    taxYear: row.tax_year,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    dueDate: row.due_date,
    filingStatus: filingOf(row.filing_status),
    status: statusOf(row.status),
    estimatedCents: cents(row.amount_estimated),
    confirmedCents: cents(row.amount_confirmed),
    paidCents: cents(row.amount_paid),
    payableCents: cents(row.amount_payable),
    taxableSalesCents: cents(row.taxable_sales),
    nonTaxableSalesCents: cents(row.non_taxable_sales),
    collectedCents: cents(row.tax_collected),
    confirmationNumber: row.confirmation_number,
    notes: row.notes,
    source: row.source === 'firm_entry' ? 'firm_entry' : 'firm_document',
    documentVersionId: row.document_version_id,
    pageNumber: row.page_number,
    jurisdiction: jurisdictionOf(row.tax_jurisdictions),
    payments: payments
      .filter((payment) => payment.obligation_id === row.id)
      .map<TaxPayment>((payment) => ({
        id: payment.id,
        paidOn: payment.paid_on,
        amountCents: Math.round(payment.amount * 100),
        method: payment.method,
        confirmationNumber: payment.confirmation_number,
        documentVersionId: payment.document_version_id,
        pageNumber: payment.page_number,
      })),
  }));
}
