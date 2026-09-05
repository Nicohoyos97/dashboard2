// End-to-end PDF ingestion, pure: bytes in, validated and reconciled records
// out. Persistence belongs to the worker. Letter, notes and other pages are
// never sent to extraction; the model's own free-text warnings stay inside
// `data.warnings` while the pipeline's warnings carry identifiers only.
import type Anthropic from '@anthropic-ai/sdk';

import { classifyPages } from './classify';
import type { PdfPage } from './classify';
import { IngestionError } from './errors';
import { extractBankActivity, extractFinancialStatement, extractSalesReport, extractTaxRecord } from './extract';
import { buildHierarchy } from './hierarchy';
import type { Hierarchy } from './hierarchy';
import { getPageCount, splitPages } from './pdf';
import { reconcileBankStatement, reconcileSalesReport, reconcileSalesTax, reconcileStatement } from './reconcile';
import { CONFIDENCE_THRESHOLD } from './reconciliation';
import type { Reconciliation } from './reconciliation';
import { ZERO_USAGE, addUsage } from './request';
import type { TokenUsage } from './request';
import type { BankActivity } from './schemas/bank-activity';
import type { ClassifiedPage, ReportType } from './schemas/classification';
import type { FinancialStatement } from './schemas/financial-statement';
import type { SalesReport } from './schemas/sales-report';
import type { TaxRecord, TaxType } from './schemas/tax-record';

export type ExtractableType = Exclude<ReportType, 'other'>;

export type PipelineInput = {
  pdf: Buffer;
  anthropic: Anthropic;
  expectedType?: ExtractableType | undefined;
  models?: { fast?: string | undefined; reasoning?: string | undefined } | undefined;
};

export type PipelineResult =
  | { kind: 'financial_statement'; data: FinancialStatement; hierarchy: Hierarchy; reconciliation: Reconciliation; pages: number[] }
  | { kind: 'bank_activity'; data: BankActivity; reconciliation: Reconciliation; pages: number[] }
  | { kind: 'sales_report'; data: SalesReport; reconciliation: Reconciliation; pages: number[] }
  | { kind: 'tax_record'; data: TaxRecord; reconciliation: Reconciliation; pages: number[] };

export type PipelineOutput = {
  pageCount: number;
  pages: ClassifiedPage[];
  results: PipelineResult[];
  usage: TokenUsage;
  warnings: string[];
};

const TAX_TYPE_FOR: Partial<Record<ExtractableType, TaxType>> = {
  sales_tax: 'sales',
  income_tax: 'income',
  payroll: 'payroll',
};

/** Groups statement pages by report type; `expectedType` only settles pages the classifier left ambiguous. */
export function groupStatementPages(
  pages: readonly ClassifiedPage[],
  expectedType: ExtractableType | undefined,
  warnings: string[],
): Map<ExtractableType, number[]> {
  const groups = new Map<ExtractableType, number[]>();
  for (const page of pages) {
    if (page.kind !== 'financial_statement') continue;
    const suggested = page.report_type === 'other' ? undefined : page.report_type;
    let type: ExtractableType | undefined = suggested;
    if (suggested === undefined || page.confidence < CONFIDENCE_THRESHOLD) {
      if (expectedType === undefined) {
        warnings.push(`page ${page.page}: report type unresolved, not extracted`);
        continue;
      }
      if (suggested !== undefined && suggested !== expectedType) {
        warnings.push(`page ${page.page}: classifier suggested ${suggested} at low confidence, using ${expectedType}`);
      }
      type = expectedType;
    } else if (expectedType !== undefined && suggested !== expectedType) {
      warnings.push(`page ${page.page}: classified as ${suggested}, expected ${expectedType}`);
    }
    if (type === undefined) continue;
    groups.set(type, [...(groups.get(type) ?? []), page.page]);
  }
  return groups;
}

export async function runPdfPipeline(input: PipelineInput): Promise<PipelineOutput> {
  const pageCount = await getPageCount(input.pdf);
  const split = await splitPages(input.pdf);
  const allPages: PdfPage[] = split.map((pdf, index) => ({ page: index + 1, pdf }));

  const classification = await classifyPages({
    pages: allPages,
    anthropic: input.anthropic,
    model: input.models?.fast,
  });
  let usage = addUsage(ZERO_USAGE, classification.usage);
  const warnings: string[] = [];
  const results: PipelineResult[] = [];

  const groups = groupStatementPages(classification.pages, input.expectedType, warnings);
  if (groups.size === 0) warnings.push('no financial statement pages found');

  for (const [type, pageNumbers] of groups) {
    const pages = pageNumbers.map((page) => {
      const pdf = split[page - 1];
      if (!pdf) throw new IngestionError('page_out_of_range', `page ${page}`);
      return { page, pdf };
    });
    const extractInput = { pages, anthropic: input.anthropic, model: input.models?.reasoning };
    const label = `pages ${pageNumbers.join(',')}`;

    if (type === 'profit_and_loss' || type === 'balance_sheet') {
      const { data, usage: used } = await extractFinancialStatement(extractInput);
      usage = addUsage(usage, used);
      if (data.report_type !== type) warnings.push(`${label}: extracted as ${data.report_type}, classified as ${type}`);
      const hierarchy = buildHierarchy(data.lines);
      warnings.push(...hierarchy.warnings);
      const reconciliation = reconcileStatement(hierarchy.rows, data.report_type);
      results.push({ kind: 'financial_statement', data, hierarchy, reconciliation, pages: pageNumbers });
    } else if (type === 'bank_statement') {
      const { data, usage: used } = await extractBankActivity(extractInput);
      usage = addUsage(usage, used);
      results.push({ kind: 'bank_activity', data, reconciliation: reconcileBankStatement(data), pages: pageNumbers });
    } else if (type === 'sales_report') {
      const { data, usage: used } = await extractSalesReport(extractInput);
      usage = addUsage(usage, used);
      results.push({
        kind: 'sales_report',
        data,
        reconciliation: reconcileSalesReport(data, data.tenders ?? []),
        pages: pageNumbers,
      });
    } else {
      const { data, usage: used } = await extractTaxRecord(extractInput);
      usage = addUsage(usage, used);
      const expectedTaxType = TAX_TYPE_FOR[type];
      if (expectedTaxType && data.tax_type !== expectedTaxType) {
        warnings.push(`${label}: extracted tax type ${data.tax_type}, classified as ${type}`);
      }
      results.push({ kind: 'tax_record', data, reconciliation: reconcileSalesTax(data), pages: pageNumbers });
    }
  }

  return { pageCount, pages: classification.pages, results, usage, warnings };
}
