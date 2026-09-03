// @vitest-environment node
import { describe, expect, it } from 'vitest';

import {
  CLASSIFY_SYSTEM_PROMPT,
  CSV_MAPPING_SYSTEM_PROMPT,
  EXTRACT_BANK_ACTIVITY_SYSTEM_PROMPT,
  EXTRACT_FINANCIAL_STATEMENT_SYSTEM_PROMPT,
  EXTRACT_TAX_RECORD_SYSTEM_PROMPT,
  UNTRUSTED_CONTENT_NOTICE,
  csvMappingInstruction,
  pagesInstruction,
} from '@/lib/ingestion/prompts';

const PROMPTS = {
  classify: CLASSIFY_SYSTEM_PROMPT,
  extractFinancialStatement: EXTRACT_FINANCIAL_STATEMENT_SYSTEM_PROMPT,
  extractBankActivity: EXTRACT_BANK_ACTIVITY_SYSTEM_PROMPT,
  extractTaxRecord: EXTRACT_TAX_RECORD_SYSTEM_PROMPT,
  csvMapping: CSV_MAPPING_SYSTEM_PROMPT,
};

const PAGE_PROMPTS = [CLASSIFY_SYSTEM_PROMPT, EXTRACT_FINANCIAL_STATEMENT_SYSTEM_PROMPT, EXTRACT_BANK_ACTIVITY_SYSTEM_PROMPT, EXTRACT_TAX_RECORD_SYSTEM_PROMPT];
const EXTRACTION_PROMPTS = PAGE_PROMPTS.slice(1);

describe('system prompts', () => {
  it.each(Object.entries(PROMPTS))('%s is stable', (_name, prompt) => {
    expect(prompt).toMatchSnapshot();
  });

  it.each(Object.entries(PROMPTS))('%s declares document content untrusted data, never instructions', (_name, prompt) => {
    expect(prompt).toContain(UNTRUSTED_CONTENT_NOTICE);
    expect(prompt).toContain('ignore previous instructions');
  });

  it('page-bound prompts label pages "Page N" and bind page numbers to the request', () => {
    for (const prompt of PAGE_PROMPTS) {
      expect(prompt).toContain('titled "Page N"');
      expect(prompt).toContain('pages attached to this request');
    }
  });

  it('extraction prompts forbid computed totals and demand exact source text', () => {
    for (const prompt of EXTRACTION_PROMPTS) {
      expect(prompt).toContain('Never compute');
      expect(prompt).toContain('source_text is the whole line copied exactly as printed');
      expect(prompt).toContain('never substitute 0 for a blank');
    }
  });

  it('pagesInstruction lists exactly the attached pages', () => {
    expect(pagesInstruction([2, 3])).toBe('This request contains 2 page(s): Page 2, Page 3. Respond with the structured output only.');
  });

  it('csvMappingInstruction delimits headers and sample rows', () => {
    const text = csvMappingInstruction(['Date', 'Amount'], [{ Date: '06/02/2026', Amount: '1.00' }]);
    expect(text).toBe('<csv_headers>\n["Date","Amount"]\n</csv_headers>\n<csv_sample_rows>\n[{"Date":"06/02/2026","Amount":"1.00"}]\n</csv_sample_rows>');
  });
});
