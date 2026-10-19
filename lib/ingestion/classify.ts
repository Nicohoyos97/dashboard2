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

/** Model calls one document keeps in flight at once: enough to fit a long statement inside the worker's budget, few enough to stay clear of rate limits. */
export const REQUEST_CONCURRENCY = 3;

export type PdfPage = { page: number; pdf: Buffer };

export type ClassifyInput = {
  pages: readonly PdfPage[];
  anthropic: Anthropic;
  model?: string | undefined;
  signal?: AbortSignal | undefined;
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

/** `fn` over every item with at most `limit` calls in flight; results keep the input's order. */
export async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  let failed = false;
  const worker = async (): Promise<void> => {
    // One failure fails the whole map, so nothing new starts after it.
    while (!failed && next < items.length) {
      const index = next;
      next += 1;
      try {
        results[index] = await fn(items[index] as T);
      } catch (error) {
        failed = true;
        throw error;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(Math.max(limit, 1), items.length) }, worker));
  return results;
}

export async function classifyPages(input: ClassifyInput): Promise<ClassifyResult> {
  if (input.pages.length === 0) throw new TypeError('classifyPages: no pages');
  const options = modelOptions('fast', input.model);
  const results = await mapLimit(chunk(input.pages, CLASSIFY_BATCH_SIZE), REQUEST_CONCURRENCY, async (batch) => {
    const sent = batch.map((page) => page.page);
    const result = await requestStructured({
      anthropic: input.anthropic,
      options,
      system: CLASSIFY_SYSTEM_PROMPT,
      content: [...batch.map((page) => documentBlock(page.page, page.pdf)), textBlock(pagesInstruction(sent))],
      apiSchema: ClassificationApiSchema,
      strictSchema: ClassificationSchema,
      signal: input.signal,
    });
    assertPagesMatch(
      result.data.pages.map((page) => page.page),
      sent,
    );
    return result;
  });

  const pages = results.flatMap((result) => result.data.pages);
  const usage = results.reduce((total, result) => addUsage(total, result.usage), ZERO_USAGE);
  return { pages: pages.sort((a, b) => a.page - b.page), usage };
}
