// Input schemas of Nick's eleven read-only tools (INITIAL_PROMPT.md §10).
// Every input is validated with Zod even though the model produced it; the
// tool definitions sent to the API are strict JSON schemas generated from the
// same Zod objects. No schema accepts a tenant identifier — the business is
// closed over from the session (./context.ts).
import { z } from 'zod';

import type { PortalModule, PortalModules } from '@/lib/portal/modules';

const PERIOD_DESCRIPTION =
  'Reporting period as start_end in ISO dates, e.g. 2026-01-01_2026-06-30. Null uses the period selected on the page, or the newest published one.';

const period = z.string().nullable().describe(PERIOD_DESCRIPTION);

export const TOOL_INPUTS = {
  get_overview_metrics: z.strictObject({ period }),
  get_profit_and_loss: z.strictObject({
    period,
    detail: z
      .enum(['summary', 'lines'])
      .describe('summary = headline totals and margins; lines = the statement lines too'),
    query: z
      .string()
      .nullable()
      .describe('Account name to look for in the statement lines (case-insensitive), or null'),
  }),
  get_balance_sheet: z.strictObject({
    period: z
      .string()
      .nullable()
      .describe(
        'Balance Sheet "as of" date as date_date, e.g. 2026-06-30_2026-06-30, or null for the newest published one',
      ),
    detail: z
      .enum(['summary', 'lines'])
      .describe('summary = totals, working capital and ratios; lines = the statement lines too'),
    query: z
      .string()
      .nullable()
      .describe('Account name to look for in the statement lines (case-insensitive), or null'),
  }),
  get_expense_breakdown: z.strictObject({
    period,
    limit: z
      .number()
      .int()
      .nullable()
      .describe('How many categories to return, largest first; null = 8'),
  }),
  get_income_tax_status: z.strictObject({
    tax_year: z.number().int().nullable().describe('Tax year, or null for every published year'),
  }),
  get_sales_tax_status: z.strictObject({ period }),
  get_upcoming_obligations: z.strictObject({
    days_ahead: z
      .number()
      .int()
      .nullable()
      .describe('Look-ahead window in days from today; null = 90'),
    include_settled: z.boolean().describe('Also return paid and completed items'),
  }),
  list_available_reports: z.strictObject({
    report_type: z
      .enum(['profit_and_loss', 'balance_sheet', 'bank_statement', 'tax', 'other'])
      .nullable()
      .describe('Filter, or null for everything'),
  }),
  get_report_download_link: z.strictObject({
    document_version_id: z
      .string()
      .uuid()
      .describe('The documentVersionId returned by list_available_reports or a statement tool'),
    confirmed: z
      .boolean()
      .describe('true only after the user explicitly confirmed this download in a later message'),
  }),
  compare_financial_periods: z.strictObject({
    statement: z.enum(['profit_and_loss', 'balance_sheet']),
    period_a: z.string().describe('First period as start_end'),
    period_b: z.string().describe('Second period as start_end'),
  }),
  create_financial_export: z.strictObject({
    report_id: z
      .string()
      .uuid()
      .describe('The reportId of a published Profit & Loss or Balance Sheet'),
    format: z.enum(['csv']),
    confirmed: z
      .boolean()
      .describe('true only after the user explicitly confirmed this export in a later message'),
  }),
} as const;

export type ToolName = keyof typeof TOOL_INPUTS;
export const TOOL_NAMES = Object.keys(TOOL_INPUTS) as ToolName[];
export type ToolInput<N extends ToolName> = z.infer<(typeof TOOL_INPUTS)[N]>;

export function isToolName(value: string): value is ToolName {
  return Object.hasOwn(TOOL_INPUTS, value);
}

export const TOOL_DESCRIPTIONS: Record<ToolName, string> = {
  get_overview_metrics:
    'Call this for questions about how the business is doing overall — revenue or net income for a period, and which periods have published data. The figures come from the published Profit & Loss.',
  get_profit_and_loss:
    'Call this for revenue, cost of goods sold, gross profit, operating expenses, net income, margins, or to explain a specific account on the Profit & Loss. Use detail "lines" or a query when the user asks about a particular expense or account.',
  get_balance_sheet:
    'Call this for assets, liabilities, equity, working capital, current ratio, debt-to-asset, cash on the balance sheet, receivables or any Balance Sheet account.',
  get_expense_breakdown:
    'Call this when the user asks which expenses are largest, how spending is distributed, or what share a category takes. Reads the operating expense lines of the published Profit & Loss.',
  get_income_tax_status:
    'Call this for income tax questions: estimated, confirmed, paid and remaining amounts, filing status and next payment dates as published by the firm. Amounts are labelled by status; only firm_confirmed is final.',
  get_sales_tax_status:
    'Call this for sales tax questions: taxable sales, tax collected, paid, payable, filing periods and due dates as published by the firm.',
  get_upcoming_obligations:
    'Call this for reminders and deadlines: payroll dates, tax deposits, sales-tax and estimated-tax deadlines, loan payments, renewals, with due dates, status and who is responsible.',
  list_available_reports:
    'Call this to see which statements, bank statements and documents are published, with their periods, reportId and documentVersionId. Needed before offering a download or an export.',
  get_report_download_link:
    'Sensitive. Returns the download link for an original published document. First call returns requires_confirmation with a description; ask the user to confirm and call again with confirmed: true only after they do.',
  compare_financial_periods:
    'Call this to compare two published periods of the Profit & Loss or Balance Sheet: both periods side by side with the change in amount and percent, computed by the server.',
  create_financial_export:
    'Sensitive. Creates a CSV export of a published statement and returns its download link. First call returns requires_confirmation; ask the user to confirm and call again with confirmed: true only after they do.',
};

type JsonSchema = Record<string, unknown>;

function isObject(value: unknown): value is JsonSchema {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Strict tool use requires additionalProperties:false and every property in
// required; zod's converter already lists the keys, this closes every object.
//
// It also drops the bounds zod 4 attaches to `.int()` (the safe-integer range):
// the tool-use API rejects `minimum`/`maximum` on an integer outright, and the
// mocked Anthropic server the suites run against never validated the schema, so
// the 400 only showed up against the real API.
function closeObjects(node: JsonSchema): JsonSchema {
  const out: JsonSchema = { ...node };
  delete out.$schema;
  if (out.type === 'integer') {
    delete out.minimum;
    delete out.maximum;
  }
  if (out.type === 'object' && isObject(out.properties)) {
    out.additionalProperties = false;
    out.required = Object.keys(out.properties);
    out.properties = Object.fromEntries(
      Object.entries(out.properties).map(([key, child]) => [
        key,
        isObject(child) ? closeObjects(child) : child,
      ]),
    );
  }
  if (isObject(out.items)) out.items = closeObjects(out.items);
  if (Array.isArray(out.anyOf))
    out.anyOf = out.anyOf.map((child) => (isObject(child) ? closeObjects(child) : child));
  return out;
}

export type ToolDefinition = {
  name: ToolName;
  description: string;
  strict: true;
  input_schema: JsonSchema & { type: 'object' };
};

/**
 * Which module each tool draws on. A tool with no entry works for every client
 * — reading the document library or resolving a download is not module-specific.
 * Nick ships with every package, but it must not answer from a module the firm
 * did not sell: a sales-tax-only client asking "what was my net income?" has no
 * Profit & Loss to be told about, and the page is 404 for them.
 */
const TOOL_MODULE: Partial<Record<ToolName, PortalModule>> = {
  get_profit_and_loss: 'statements',
  get_balance_sheet: 'statements',
  compare_financial_periods: 'statements',
  get_overview_metrics: 'statements',
  get_expense_breakdown: 'expenses',
  get_income_tax_status: 'income_taxes',
  get_sales_tax_status: 'sales_taxes',
};

/** The definitions sent with every request, in a fixed order so the prompt prefix stays cacheable. */
export function toolDefinitions(modules: PortalModules): ToolDefinition[] {
  return TOOL_NAMES.filter((name) => {
    const required = TOOL_MODULE[name];
    return required === undefined || modules[required];
  }).map((name) => {
    const raw: unknown = z.toJSONSchema(TOOL_INPUTS[name]);
    const schema = closeObjects(isObject(raw) ? raw : { type: 'object', properties: {} });
    return {
      name,
      description: TOOL_DESCRIPTIONS[name],
      strict: true,
      input_schema: { ...schema, type: 'object' },
    };
  });
}
