// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { TOOL_INPUTS, TOOL_NAMES, isToolName, toolDefinitions } from '@/lib/ai/nick/tools/schemas';

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
    expect(toolDefinitions().map((tool) => tool.name)).toEqual(SPEC_TOOLS);
  });

  it('sends strict, closed JSON schemas with every property required', () => {
    for (const tool of toolDefinitions()) {
      expect(tool.strict).toBe(true);
      expect(tool.input_schema.type).toBe('object');
      expect(tool.input_schema.additionalProperties).toBe(false);
      const properties = tool.input_schema.properties as Record<string, unknown>;
      expect(tool.input_schema.required).toEqual(Object.keys(properties));
      expect(tool.input_schema).not.toHaveProperty('$schema');
      expect(tool.description.length).toBeGreaterThan(40);
    }
  });

  it('never accepts a tenant identifier in any tool', () => {
    for (const tool of toolDefinitions()) {
      const text = JSON.stringify(tool.input_schema).toLowerCase();
      expect(text).not.toContain('entity');
      expect(text).not.toContain('tenant');
      expect(text).not.toContain('business');
    }
  });

  it('rejects unknown properties and wrong shapes from the model', () => {
    expect(TOOL_INPUTS.get_profit_and_loss.safeParse({ period: null, detail: 'summary', query: null, business_entity_id: 'x' }).success).toBe(false);
    expect(TOOL_INPUTS.get_profit_and_loss.safeParse({ period: null, detail: 'everything', query: null }).success).toBe(false);
    expect(TOOL_INPUTS.get_report_download_link.safeParse({ document_version_id: 'not-a-uuid', confirmed: true }).success).toBe(false);
    expect(TOOL_INPUTS.get_upcoming_obligations.safeParse({ days_ahead: '30', include_settled: false }).success).toBe(false);
  });

  it('accepts the shapes the prompt describes', () => {
    expect(TOOL_INPUTS.get_profit_and_loss.safeParse({ period: '2026-01-01_2026-06-30', detail: 'lines', query: 'payroll' }).success).toBe(true);
    expect(TOOL_INPUTS.compare_financial_periods.safeParse({ statement: 'balance_sheet', period_a: '2025-12-31_2025-12-31', period_b: '2026-06-30_2026-06-30' }).success).toBe(true);
    expect(TOOL_INPUTS.create_financial_export.safeParse({ report_id: '4d1c3e1a-9f0e-4c7b-9a0c-2f4b3a1d5e6f', format: 'csv', confirmed: false }).success).toBe(true);
  });

  it('isToolName is a closed check', () => {
    expect(isToolName('get_profit_and_loss')).toBe(true);
    expect(isToolName('drop_tables')).toBe(false);
    expect(isToolName('constructor')).toBe(false);
  });
});
