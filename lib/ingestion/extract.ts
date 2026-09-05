// Pass 2: the reasoning model transcribes statement pages only — the caller
// (pipeline.ts) never hands it letter, notes or other pages. A request carries
// at most EXTRACTION_CHUNK_PAGES pages so it fits the worker's time and output
// budgets; a longer statement is extracted chunk by chunk and merged — refs
// are offset per chunk and parents stay within their chunk, so a section that
// straddles a chunk boundary fails its subtotal check and lands in review
// rather than being silently stitched. A tax record is one request: one
// document yields one record.
import type Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';

import { modelOptions } from '@/lib/ai/models';

import { chunk } from './classify';
import type { PdfPage } from './classify';
import { IngestionError } from './errors';
import {
  EXTRACT_BANK_ACTIVITY_SYSTEM_PROMPT,
  EXTRACT_FINANCIAL_STATEMENT_SYSTEM_PROMPT,
  EXTRACT_SALES_REPORT_SYSTEM_PROMPT,
  EXTRACT_TAX_RECORD_SYSTEM_PROMPT,
  pagesInstruction,
} from './prompts';
import { ZERO_USAGE, addUsage, documentBlock, requestStructured, textBlock } from './request';
import type { TokenUsage } from './request';
import { BankActivityApiSchema, BankActivitySchema } from './schemas/bank-activity';
import type { BankActivity } from './schemas/bank-activity';
import { FinancialStatementApiSchema, FinancialStatementSchema } from './schemas/financial-statement';
import type { FinancialStatement, FinancialStatementLine } from './schemas/financial-statement';
import { SalesReportApiSchema, SalesReportSchema } from './schemas/sales-report';
import type { SalesReport } from './schemas/sales-report';
import { TaxRecordApiSchema, TaxRecordSchema } from './schemas/tax-record';
import type { TaxRecord } from './schemas/tax-record';

export const EXTRACTION_CHUNK_PAGES = 10;
export const TAX_RECORD_MAX_PAGES = 20;

export type ExtractInput = {
  pages: readonly PdfPage[];
  anthropic: Anthropic;
  model?: string | undefined;
};

export type ExtractResult<T> = { data: T; usage: TokenUsage };

type Extractor<TApi extends z.ZodType, TStrict extends z.ZodType> = {
  system: string;
  apiSchema: TApi;
  strictSchema: TStrict;
  pagesOf: (data: z.infer<TStrict>) => number[];
};

const STATEMENT: Extractor<typeof FinancialStatementApiSchema, typeof FinancialStatementSchema> = {
  system: EXTRACT_FINANCIAL_STATEMENT_SYSTEM_PROMPT,
  apiSchema: FinancialStatementApiSchema,
  strictSchema: FinancialStatementSchema,
  pagesOf: (data) => data.lines.map((line) => line.page),
};

const BANK: Extractor<typeof BankActivityApiSchema, typeof BankActivitySchema> = {
  system: EXTRACT_BANK_ACTIVITY_SYSTEM_PROMPT,
  apiSchema: BankActivityApiSchema,
  strictSchema: BankActivitySchema,
  pagesOf: (data) => data.transactions.map((transaction) => transaction.page),
};

const SALES_REPORT: Extractor<typeof SalesReportApiSchema, typeof SalesReportSchema> = {
  system: EXTRACT_SALES_REPORT_SYSTEM_PROMPT,
  apiSchema: SalesReportApiSchema,
  strictSchema: SalesReportSchema,
  pagesOf: (data) => [data.page],
};

const TAX: Extractor<typeof TaxRecordApiSchema, typeof TaxRecordSchema> = {
  system: EXTRACT_TAX_RECORD_SYSTEM_PROMPT,
  apiSchema: TaxRecordApiSchema,
  strictSchema: TaxRecordSchema,
  pagesOf: (data) => [data.page],
};

async function requestPages<TApi extends z.ZodType, TStrict extends z.ZodType>(
  input: ExtractInput,
  pages: readonly PdfPage[],
  extractor: Extractor<TApi, TStrict>,
): Promise<ExtractResult<z.infer<TStrict>>> {
  const sent = pages.map((page) => page.page);
  const result = await requestStructured({
    anthropic: input.anthropic,
    options: modelOptions('reasoning', input.model),
    system: extractor.system,
    content: [...pages.map((page) => documentBlock(page.page, page.pdf)), textBlock(pagesInstruction(sent))],
    apiSchema: extractor.apiSchema,
    strictSchema: extractor.strictSchema,
  });
  const stray = extractor.pagesOf(result.data).find((page) => !sent.includes(page));
  if (stray !== undefined) throw new IngestionError('page_out_of_range', `page ${stray}`);
  return result;
}

async function requestChunks<TApi extends z.ZodType, TStrict extends z.ZodType>(
  input: ExtractInput,
  extractor: Extractor<TApi, TStrict>,
): Promise<{ chunks: z.infer<TStrict>[]; usage: TokenUsage }> {
  if (input.pages.length === 0) throw new TypeError('extract: no pages');
  const chunks: z.infer<TStrict>[] = [];
  let usage = ZERO_USAGE;
  for (const pages of chunk(input.pages, EXTRACTION_CHUNK_PAGES)) {
    const result = await requestPages(input, pages, extractor);
    chunks.push(result.data);
    usage = addUsage(usage, result.usage);
  }
  return { chunks, usage };
}

function revalidate<T extends z.ZodType>(schema: T, merged: unknown): z.infer<T> {
  const parsed = schema.safeParse(merged);
  if (!parsed.success) throw new IngestionError('schema_invalid', 'merged chunks');
  return parsed.data;
}

const refNumber = (ref: string): number => Number(ref.slice(1));
const shiftRef = (ref: string, offset: number): string => `L${refNumber(ref) + offset}`;

export async function extractFinancialStatement(input: ExtractInput): Promise<ExtractResult<FinancialStatement>> {
  const { chunks, usage } = await requestChunks(input, STATEMENT);
  const [first] = chunks;
  if (!first) throw new TypeError('extract: no chunks');
  if (chunks.length === 1) return { data: first, usage };

  const lines: FinancialStatementLine[] = [];
  const warnings: string[] = [];
  let offset = 0;
  chunks.forEach((part, index) => {
    for (const line of part.lines) {
      lines.push({
        ...line,
        ref: shiftRef(line.ref, offset),
        parent_ref: line.parent_ref === null ? null : shiftRef(line.parent_ref, offset),
      });
    }
    offset += Math.max(...part.lines.map((line) => refNumber(line.ref)));
    warnings.push(...part.warnings);
    if (index > 0 && part.report_type !== first.report_type) {
      warnings.push(`chunk ${index + 1}: report_type ${part.report_type} differs from chunk 1`);
    }
  });
  return { data: revalidate(FinancialStatementSchema, { ...first, lines, warnings }), usage };
}

/** Header fields and both summary balances come from the first chunk (the statement summary is on page 1). */
export async function extractBankActivity(input: ExtractInput): Promise<ExtractResult<BankActivity>> {
  const { chunks, usage } = await requestChunks(input, BANK);
  const [first] = chunks;
  if (!first) throw new TypeError('extract: no chunks');
  if (chunks.length === 1) return { data: first, usage };
  const transactions = chunks.flatMap((part) => part.transactions);
  return { data: revalidate(BankActivitySchema, { ...first, transactions }), usage };
}

/** One record for the whole period, so the page budget matches a tax record. */
export async function extractSalesReport(input: ExtractInput): Promise<ExtractResult<SalesReport>> {
  if (input.pages.length === 0) throw new TypeError('extract: no pages');
  if (input.pages.length > TAX_RECORD_MAX_PAGES) {
    throw new IngestionError('pdf_too_many_pages', `${input.pages.length} pages for one sales report`);
  }
  return requestPages(input, input.pages, SALES_REPORT);
}

export async function extractTaxRecord(input: ExtractInput): Promise<ExtractResult<TaxRecord>> {
  if (input.pages.length === 0) throw new TypeError('extract: no pages');
  if (input.pages.length > TAX_RECORD_MAX_PAGES) {
    throw new IngestionError('pdf_too_many_pages', `${input.pages.length} pages for one tax record`);
  }
  return requestPages(input, input.pages, TAX);
}
