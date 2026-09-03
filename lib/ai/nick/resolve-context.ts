// Turns the browser's page pointer into facts the server vouches for (spec
// §10 "Context"): the period must be a published one, the selected line must
// be a line of a published statement of this business, and the values shown
// to the model are read from the database here — never from the request.
import 'server-only';

import type { Db, NickLocale } from './tools/context';
import { parsePeriodInput, periodText } from './tools/context';
import type { PageContext, ResolvedContext, SelectedLine } from './types';

type PeriodSpan = { periodStart: string; periodEnd: string };

async function loadSelectedLine(supabase: Db, entityId: string, lineId: string): Promise<SelectedLine | null> {
  const { data } = await supabase
    .from('financial_statement_lines')
    .select('id, account_name, current, prior, page_number, report_id, financial_reports!inner(report_type, period_start, period_end, currency, source, document_version_id, status)')
    .eq('id', lineId)
    .eq('business_entity_id', entityId)
    .eq('financial_reports.status', 'published')
    .maybeSingle();
  if (!data) return null;
  const report = data.financial_reports;
  const cents = (value: number | null) => (value === null ? null : Math.round(value * 100));
  return {
    lineId: data.id,
    accountName: data.account_name,
    currentCents: cents(data.current),
    priorCents: cents(data.prior),
    page: data.page_number,
    reportId: data.report_id,
    reportType: report.report_type === 'balance_sheet' ? 'balance_sheet' : 'profit_and_loss',
    documentVersionId: report.document_version_id,
    periodStart: report.period_start,
    periodEnd: report.period_end,
    currency: report.currency,
    source: report.source === 'firm_entry' ? 'firm_entry' : 'firm_document',
  };
}

export async function resolveContext(
  supabase: Db,
  entityId: string,
  locale: NickLocale,
  raw: PageContext | undefined,
  published: { reports: readonly PeriodSpan[]; statements: readonly PeriodSpan[] },
): Promise<ResolvedContext> {
  const page = raw?.page ?? 'chat';
  const wanted = parsePeriodInput(raw?.period);
  const spans = [...published.reports, ...published.statements];
  const known = wanted && spans.some((span) => span.periodStart === wanted.start && span.periodEnd === wanted.end);
  const period = wanted && known ? { ...wanted, label: periodText(wanted.start, wanted.end, locale) } : null;
  const line = raw?.lineId ? await loadSelectedLine(supabase, entityId, raw.lineId) : null;
  return { page, period, line };
}
