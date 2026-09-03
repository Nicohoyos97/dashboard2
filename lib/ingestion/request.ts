// One structured-output call to the Messages API, non-streaming with an
// explicit per-request timeout: the SDK refuses a non-streaming call without
// one when `max_tokens` could run past ten minutes, and the worker runs under
// a 300 s function budget. The wire format carries the JSON schema only — the
// SDK's auto-parse hook (`messages.parse`) is deliberately left out because it
// throws on any non-JSON text block, which would hide `stop_reason` (a refusal
// or truncation must be reported by code). Nothing from the model leaves this
// function until the strict Zod schema has accepted it.
import type Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';

import type { ModelOptions } from '@/lib/ai/models';

import { IngestionError } from './errors';
import { apiOutputFormat } from './output-format';

export const REQUEST_TIMEOUT_MS = 240_000;

export type TokenUsage = { inputTokens: number; outputTokens: number };

export const ZERO_USAGE: TokenUsage = { inputTokens: 0, outputTokens: 0 };

export function addUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return { inputTokens: a.inputTokens + b.inputTokens, outputTokens: a.outputTokens + b.outputTokens };
}

export type StructuredRequest<TApi extends z.ZodType, TStrict extends z.ZodType> = {
  anthropic: Anthropic;
  options: ModelOptions;
  system: string;
  content: Anthropic.ContentBlockParam[];
  apiSchema: TApi;
  strictSchema: TStrict;
};

// Only schema paths and issue codes — never received values — may leave here.
function issueSummary(error: z.ZodError): string {
  return error.issues
    .slice(0, 5)
    .map((issue) => `${issue.path.map(String).join('.') || '$'}:${issue.code}`)
    .join(', ');
}

export async function requestStructured<TApi extends z.ZodType, TStrict extends z.ZodType>(
  request: StructuredRequest<TApi, TStrict>,
): Promise<{ data: z.infer<TStrict>; usage: TokenUsage }> {
  const format = apiOutputFormat(request.apiSchema);
  const message = await request.anthropic.messages.create(
    {
      model: request.options.model,
      max_tokens: request.options.maxTokens,
      system: request.system,
      messages: [{ role: 'user', content: request.content }],
      output_config: { effort: request.options.effort, format: { type: format.type, schema: format.schema } },
    },
    { timeout: REQUEST_TIMEOUT_MS },
  );
  const usage: TokenUsage = {
    inputTokens: message.usage.input_tokens,
    outputTokens: message.usage.output_tokens,
  };

  switch (message.stop_reason) {
    case 'refusal':
      throw new IngestionError('model_refusal', message.stop_details?.category ?? undefined);
    case 'max_tokens':
    case 'model_context_window_exceeded':
      throw new IngestionError('extraction_truncated', message.stop_reason);
    case 'end_turn':
      break;
    default:
      throw new IngestionError('schema_invalid', `stop_reason ${message.stop_reason ?? 'null'}`);
  }

  const text = message.content.find((block): block is Anthropic.TextBlock => block.type === 'text');
  if (!text) throw new IngestionError('schema_invalid', 'no text block');

  let json: unknown;
  try {
    json = JSON.parse(text.text);
  } catch {
    throw new IngestionError('schema_invalid', 'not json');
  }
  const parsed = request.strictSchema.safeParse(json);
  if (!parsed.success) throw new IngestionError('schema_invalid', issueSummary(parsed.error));
  return { data: parsed.data, usage };
}

export function documentBlock(page: number, pdf: Buffer): Anthropic.DocumentBlockParam {
  // Buffer#toString('base64') never inserts line breaks.
  return {
    type: 'document',
    source: { type: 'base64', media_type: 'application/pdf', data: pdf.toString('base64') },
    title: `Page ${page}`,
  };
}

export function textBlock(text: string): Anthropic.TextBlockParam {
  return { type: 'text', text };
}
