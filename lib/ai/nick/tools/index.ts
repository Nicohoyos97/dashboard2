// Tool dispatcher: validates the model's input with the tool's Zod schema,
// runs the handler with the session-scoped context, and turns any failure
// into a small typed error result (never a thrown exception, never content in
// logs).
import { z } from 'zod';

import { type ToolContext, ToolError, type ToolResult } from './context';
import { createFinancialExport, getReportDownloadLink } from './exports';
import { getOverviewMetrics, getUpcomingObligations, listAvailableReports } from './overview';
import { TOOL_INPUTS, isToolName } from './schemas';
import { compareFinancialPeriods, getBalanceSheet, getExpenseBreakdown, getProfitAndLoss } from './statements';
import { getIncomeTaxStatus, getSalesTaxStatus } from './taxes';

export type { ToolContext, ToolResult } from './context';
export { ToolError } from './context';

function issueSummary(error: z.ZodError): string {
  return error.issues
    .slice(0, 5)
    .map((issue) => `${issue.path.map(String).join('.') || '$'}:${issue.code}`)
    .join(', ');
}

async function dispatch(name: keyof typeof TOOL_INPUTS, raw: unknown, ctx: ToolContext): Promise<ToolResult> {
  switch (name) {
    case 'get_overview_metrics':
      return getOverviewMetrics(ctx, TOOL_INPUTS[name].parse(raw));
    case 'get_profit_and_loss':
      return getProfitAndLoss(ctx, TOOL_INPUTS[name].parse(raw));
    case 'get_balance_sheet':
      return getBalanceSheet(ctx, TOOL_INPUTS[name].parse(raw));
    case 'get_expense_breakdown':
      return getExpenseBreakdown(ctx, TOOL_INPUTS[name].parse(raw));
    case 'get_income_tax_status':
      return getIncomeTaxStatus(ctx, TOOL_INPUTS[name].parse(raw));
    case 'get_sales_tax_status':
      return getSalesTaxStatus(ctx, TOOL_INPUTS[name].parse(raw));
    case 'get_upcoming_obligations':
      return getUpcomingObligations(ctx, TOOL_INPUTS[name].parse(raw));
    case 'list_available_reports':
      return listAvailableReports(ctx, TOOL_INPUTS[name].parse(raw));
    case 'get_report_download_link':
      return getReportDownloadLink(ctx, TOOL_INPUTS[name].parse(raw));
    case 'compare_financial_periods':
      return compareFinancialPeriods(ctx, TOOL_INPUTS[name].parse(raw));
    case 'create_financial_export':
      return createFinancialExport(ctx, TOOL_INPUTS[name].parse(raw));
  }
}

export async function runTool(name: string, raw: unknown, ctx: ToolContext): Promise<{ ok: boolean; result: ToolResult }> {
  if (!isToolName(name)) return { ok: false, result: { error: 'unknown_tool' } };
  const parsed = TOOL_INPUTS[name].safeParse(raw);
  if (!parsed.success) return { ok: false, result: { error: 'invalid_input', issues: issueSummary(parsed.error) } };
  try {
    return { ok: true, result: await dispatch(name, parsed.data, ctx) };
  } catch (error) {
    if (error instanceof ToolError) return { ok: false, result: { error: error.code } };
    console.error('[nick] tool failed:', name, error instanceof Error ? error.name : 'unknown');
    return { ok: false, result: { error: 'tool_failed' } };
  }
}
