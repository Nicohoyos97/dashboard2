// Income and sales tax status (spec §7): firm-document or firm-entry rows
// only, published and not superseded, every amount labelled by the row's
// status. Nothing here is final unless the firm confirmed it.
import { citationLabel } from '@/lib/ai/nick/citations';
import { fromCents } from '@/lib/money';

import {
  type ToolContext,
  type ToolResult,
  label,
  money,
  parsePeriodInput,
  periodOf,
} from './context';
import type { ToolInput } from './schemas';

const OBLIGATION_COLUMNS =
  'id, tax_type, tax_year, period_start, period_end, due_date, filing_status, amount_estimated, amount_confirmed, amount_paid, amount_payable, taxable_sales, non_taxable_sales, tax_collected, status, confirmation_number, notes, source, document_version_id, page_number, tax_jurisdictions (name, level, code, filing_frequency)';

const MAX_OBLIGATIONS = 24;

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
  tax_jurisdictions: {
    name: string;
    level: string;
    code: string;
    filing_frequency: string | null;
  } | null;
};

type PaymentRow = {
  id: string;
  obligation_id: string;
  paid_on: string;
  amount: number;
  method: string | null;
  confirmation_number: string | null;
  source: string;
  document_version_id: string | null;
  page_number: number | null;
};

const cents = (value: number | null): number | null =>
  value === null ? null : Math.round(value * 100);

function sourceOf(value: string): 'firm_document' | 'firm_entry' {
  return value === 'firm_entry' ? 'firm_entry' : 'firm_document';
}

async function loadObligations(
  ctx: ToolContext,
  taxType: 'income' | 'sales',
): Promise<{ obligations: ObligationRow[]; payments: PaymentRow[] }> {
  const { data } = await ctx.supabase
    .from('tax_obligations')
    .select(OBLIGATION_COLUMNS)
    .eq('business_entity_id', ctx.entityId)
    .eq('tax_type', taxType)
    .not('published_at', 'is', null)
    .is('superseded_by', null)
    .order('due_date', { ascending: false, nullsFirst: false })
    .limit(MAX_OBLIGATIONS);
  const obligations = (data ?? []) as ObligationRow[];
  if (obligations.length === 0) return { obligations, payments: [] };
  const { data: paid } = await ctx.supabase
    .from('tax_payments')
    .select(
      'id, obligation_id, paid_on, amount, method, confirmation_number, source, document_version_id, page_number',
    )
    .eq('business_entity_id', ctx.entityId)
    .not('published_at', 'is', null)
    .in(
      'obligation_id',
      obligations.map((o) => o.id),
    )
    .order('paid_on');
  return { obligations, payments: (paid ?? []) as PaymentRow[] };
}

function shape(ctx: ToolContext, row: ObligationRow, payments: readonly PaymentRow[]) {
  const scope =
    row.tax_jurisdictions?.name ?? (row.tax_type === 'sales' ? 'Sales tax' : 'Income tax');
  const when =
    row.period_start && row.period_end
      ? periodOf({ periodStart: row.period_start, periodEnd: row.period_end }, ctx.locale)
      : null;
  const cite = ctx.registry.add({
    label: citationLabel([
      label(ctx.locale, 'tax'),
      scope,
      when?.label ?? row.tax_year,
      row.page_number ? `${label(ctx.locale, 'page')} ${row.page_number}` : null,
    ]),
    reportId: null,
    documentVersionId: row.document_version_id,
    lineId: null,
    page: row.page_number,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    source: sourceOf(row.source),
    href: '/dashboard#reminders',
  });
  const amount = (value: number | null) => {
    const c = cents(value);
    return c === null ? null : { amount: fromCents(c), formatted: money(ctx, c), cite };
  };
  return {
    obligationId: row.id,
    taxYear: row.tax_year,
    period: when,
    dueDate: row.due_date,
    filingStatus: row.filing_status,
    status: row.status,
    isFinal: row.status === 'firm_confirmed',
    jurisdiction: row.tax_jurisdictions
      ? {
          name: row.tax_jurisdictions.name,
          level: row.tax_jurisdictions.level,
          filingFrequency: row.tax_jurisdictions.filing_frequency,
        }
      : null,
    amounts: {
      estimated: amount(row.amount_estimated),
      confirmed: amount(row.amount_confirmed),
      paid: amount(row.amount_paid),
      payable: amount(row.amount_payable),
      ...(row.tax_type === 'sales'
        ? {
            taxableSales: amount(row.taxable_sales),
            nonTaxableSales: amount(row.non_taxable_sales),
            collected: amount(row.tax_collected),
          }
        : {}),
    },
    confirmationNumber: row.confirmation_number,
    firmNotes: row.notes,
    source: row.source,
    payments: payments
      .filter((p) => p.obligation_id === row.id)
      .map((p) => {
        const c = Math.round(p.amount * 100);
        return {
          paidOn: p.paid_on,
          amount: { amount: fromCents(c), formatted: money(ctx, c) },
          method: p.method,
          confirmationNumber: p.confirmation_number,
          cite: ctx.registry.add({
            label: citationLabel([
              label(ctx.locale, 'tax'),
              scope,
              p.paid_on,
              p.page_number ? `${label(ctx.locale, 'page')} ${p.page_number}` : null,
            ]),
            reportId: null,
            documentVersionId: p.document_version_id,
            lineId: null,
            page: p.page_number,
            periodStart: null,
            periodEnd: null,
            source: sourceOf(p.source),
            href: '/dashboard#reminders',
          }),
        };
      }),
  };
}

const DISCLAIMER =
  'Only amounts on rows with status firm_confirmed are final; estimated, payable and pending_review figures may change.';

export async function getIncomeTaxStatus(
  ctx: ToolContext,
  input: ToolInput<'get_income_tax_status'>,
): Promise<ToolResult> {
  const { obligations, payments } = await loadObligations(ctx, 'income');
  const rows = obligations.filter((o) => input.tax_year === null || o.tax_year === input.tax_year);
  if (rows.length === 0)
    return {
      available: false,
      reason: obligations.length === 0 ? 'no_published_income_tax_data' : 'tax_year_not_published',
      publishedYears: [
        ...new Set(obligations.flatMap((o) => (o.tax_year === null ? [] : [o.tax_year]))),
      ],
    };
  return {
    available: true,
    disclaimer: DISCLAIMER,
    obligations: rows.map((row) => shape(ctx, row, payments)),
  };
}

export async function getSalesTaxStatus(
  ctx: ToolContext,
  input: ToolInput<'get_sales_tax_status'>,
): Promise<ToolResult> {
  const { data: entity } = await ctx.supabase
    .from('business_entities')
    .select('sales_tax_enabled')
    .eq('id', ctx.entityId)
    .maybeSingle();
  if (!entity?.sales_tax_enabled) return { available: false, reason: 'sales_tax_module_disabled' };
  const { obligations, payments } = await loadObligations(ctx, 'sales');
  const wanted = parsePeriodInput(input.period);
  const rows = wanted
    ? obligations.filter((o) => o.period_start === wanted.start && o.period_end === wanted.end)
    : obligations.slice(0, 12);
  if (rows.length === 0)
    return {
      available: false,
      reason: obligations.length === 0 ? 'no_published_sales_tax_data' : 'period_not_published',
    };
  return {
    available: true,
    disclaimer: DISCLAIMER,
    obligations: rows.map((row) => shape(ctx, row, payments)),
  };
}
