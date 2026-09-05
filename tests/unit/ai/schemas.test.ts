// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { TOOL_INPUTS, TOOL_NAMES, isToolName, toolDefinitions } from '@/lib/ai/nick/tools/schemas';
import { PACKAGE_MODULES } from '@/lib/portal/modules';

const SPEC_TOOLS = [
  'get_overview_metrics',
  'get_profit_and_loss',
  'get_balance_sheet',
  'get_expense_breakdown',
  'get_income_tax_status',
  'get_sales_tax_status',
  'get_upcoming_obligations',
  'list_available_reports',
  'get_report_download_link',
  'compare_financial_periods',
  'create_financial_export',
];

describe('Nick tool definitions', () => {
  it('exposes exactly the eleven tools of INITIAL_PROMPT.md §10, in a fixed order', () => {
    expect(TOOL_NAMES).toEqual(SPEC_TOOLS);
    expect(toolDefinitions(PACKAGE_MODULES.full).map((tool) => tool.name)).toEqual(SPEC_TOOLS);
  });

  it('sends strict, closed JSON schemas with every property required', () => {
    for (const tool of toolDefinitions(PACKAGE_MODULES.full)) {
      expect(tool.strict).toBe(true);
      expect(tool.input_schema.type).toBe('object');
      expect(tool.input_schema.additionalProperties).toBe(false);
      const properties = tool.input_schema.properties as Record<string, unknown>;
      expect(tool.input_schema.required).toEqual(Object.keys(properties));
      expect(tool.input_schema).not.toHaveProperty('$schema');
      expect(tool.description.length).toBeGreaterThan(40);
    }
  });

  it('carries no numeric bounds the tool-use API refuses', () => {
    // zod 4 attaches the safe-integer range to `.int()`, and the API answers
    // 400 "For 'integer' type, properties maximum, minimum are not supported"
    // — which the mocked Anthropic server in the suites never checked.
    for (const tool of toolDefinitions(PACKAGE_MODULES.full)) {
      const text = JSON.stringify(tool.input_schema);
      expect(text).not.toContain('"minimum"');
      expect(text).not.toContain('"maximum"');
    }
  });

  it('never accepts a tenant identifier in any tool', () => {
    for (const tool of toolDefinitions(PACKAGE_MODULES.full)) {
      const text = JSON.stringify(tool.input_schema).toLowerCase();
      expect(text).not.toContain('entity');
      expect(text).not.toContain('tenant');
      expect(text).not.toContain('business');
    }
  });

  it('rejects unknown properties and wrong shapes from the model', () => {
    expect(
      TOOL_INPUTS.get_profit_and_loss.safeParse({
        period: null,
        detail: 'summary',
        query: null,
        business_entity_id: 'x',
      }).success,
    ).toBe(false);
    expect(
      TOOL_INPUTS.get_profit_and_loss.safeParse({ period: null, detail: 'everything', query: null })
        .success,
    ).toBe(false);
    expect(
      TOOL_INPUTS.get_report_download_link.safeParse({
        document_version_id: 'not-a-uuid',
        confirmed: true,
      }).success,
    ).toBe(false);
    expect(
      TOOL_INPUTS.get_upcoming_obligations.safeParse({ days_ahead: '30', include_settled: false })
        .success,
    ).toBe(false);
  });

  it('accepts the shapes the prompt describes', () => {
    expect(
      TOOL_INPUTS.get_profit_and_loss.safeParse({
        period: '2026-01-01_2026-06-30',
        detail: 'lines',
        query: 'payroll',
      }).success,
    ).toBe(true);
    expect(
      TOOL_INPUTS.compare_financial_periods.safeParse({
        statement: 'balance_sheet',
        period_a: '2025-12-31_2025-12-31',
        period_b: '2026-06-30_2026-06-30',
      }).success,
    ).toBe(true);
    expect(
      TOOL_INPUTS.create_financial_export.safeParse({
        report_id: '4d1c3e1a-9f0e-4c7b-9a0c-2f4b3a1d5e6f',
        format: 'csv',
        confirmed: false,
      }).success,
    ).toBe(true);
  });

  it('isToolName is a closed check', () => {
    expect(isToolName('get_profit_and_loss')).toBe(true);
    expect(isToolName('drop_tables')).toBe(false);
    expect(isToolName('constructor')).toBe(false);
  });
});

describe('tools follow the modules the firm sold', () => {
  const names = (modules: Parameters<typeof toolDefinitions>[0]) =>
    toolDefinitions(modules).map((tool) => tool.name);

  it('offers no statement, expense or income-tax tool to a sales-tax-only client', () => {
    // Nick ships with every package, but answering from a module the client did
    // not buy would contradict the portal, where those pages are 404.
    const offered = names(PACKAGE_MODULES.sales_tax);
    expect(offered).toContain('get_sales_tax_status');
    expect(offered).not.toContain('get_profit_and_loss');
    expect(offered).not.toContain('get_balance_sheet');
    expect(offered).not.toContain('get_expense_breakdown');
    expect(offered).not.toContain('get_income_tax_status');
    expect(offered).not.toContain('get_overview_metrics');
  });

  it('offers everything but sales tax to a bookkeeping client', () => {
    const offered = names(PACKAGE_MODULES.bookkeeping);
    expect(offered).toContain('get_profit_and_loss');
    expect(offered).toContain('get_expense_breakdown');
    expect(offered).not.toContain('get_sales_tax_status');
  });

  it('keeps the tools that belong to no module, so the library always works', () => {
    for (const modules of [PACKAGE_MODULES.sales_tax, PACKAGE_MODULES.bookkeeping]) {
      expect(names(modules)).toContain('list_available_reports');
      expect(names(modules)).toContain('get_report_download_link');
    }
  });
});
