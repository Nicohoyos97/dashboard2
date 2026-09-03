// Pass 1: the fast model labels every page. Pages travel in batches of at
// most 20 one-page document blocks so a request stays far below the API's
// 32 MB / 600-page ceiling regardless of the source document.
import type Anthropic from '@anthropic-ai/sdk';

import { modelOptions } from '@/lib/ai/models';

import { IngestionError } from './errors';
import { CLASSIFY_SYSTEM_PROMPT, pagesInstruction } from './prompts';
import { ZERO_USAGE, addUsage, documentBlock, requestStructured, textBlock } from './request';
import type { TokenUsage } from './request';
import { ClassificationApiSchema, ClassificationSchema } from './schemas/classification';
import type { ClassifiedPage } from './schemas/classification';

export const CLASSIFY_BATCH_SIZE = 20;

export type PdfPage = { page: number; pdf: Buffer };

export type ClassifyInput = {
  pages: readonly PdfPage[];
  anthropic: Anthropic;
  model?: string | undefined;
};

export type ClassifyResult = { pages: ClassifiedPage[]; usage: TokenUsage };

/** Throws unless the model returned every sent page exactly once and nothing else. */
export function assertPagesMatch(returned: readonly number[], sent: readonly number[]): void {
  const sentSet = new Set(sent);
  const stray = returned.find((page) => !sentSet.has(page));
  if (stray !== undefined) throw new IngestionError('page_out_of_range', `page ${stray}`);
  if (new Set(returned).size !== returned.length) throw new IngestionError('schema_invalid', 'duplicate page');
  const missing = sent.find((page) => !returned.includes(page));
  if (missing !== undefined) throw new IngestionError('schema_invalid', `page ${missing} not classified`);
}

export function chunk<T>(items: readonly T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let start = 0; start < items.length; start += size) batches.push(items.slice(start, start + size));
  return batches;
}

export async function classifyPages(input: ClassifyInput): Promise<ClassifyResult> {
  if (input.pages.length === 0) throw new TypeError('classifyPages: no pages');
  const options = modelOptions('fast', input.model);
  const pages: ClassifiedPage[] = [];
  let usage = ZERO_USAGE;

  for (const batch of chunk(input.pages, CLASSIFY_BATCH_SIZE)) {
    const sent = batch.map((page) => page.page);
    const result = await requestStructured({
      anthropic: input.anthropic,
      options,
      system: CLASSIFY_SYSTEM_PROMPT,
      content: [...batch.map((page) => documentBlock(page.page, page.pdf)), textBlock(pagesInstruction(sent))],
      apiSchema: ClassificationApiSchema,
      strictSchema: ClassificationSchema,
    });
    assertPagesMatch(
      result.data.pages.map((page) => page.page),
      sent,
    );
    pages.push(...result.data.pages);
    usage = addUsage(usage, result.usage);
  }

  return { pages: pages.sort((a, b) => a.page - b.page), usage };
}
