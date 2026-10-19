// Server-only Anthropic client. `new Anthropic()` resolves the API key from the
// environment, so the key never has to pass through application code.
import Anthropic from '@anthropic-ai/sdk';
import 'server-only';

export { MODELS, MODEL_DEFAULTS, modelId, modelOptions } from './models';
export type { Effort, ModelOptions, ModelRole } from './models';

let client: Anthropic | null = null;

export function getAnthropic(): Anthropic {
  // One retry. Two 240 s attempts would not fit the worker's 300 s function,
  // so the worker bounds each job with its own abort signal (ingestion/worker.ts).
  client ??= new Anthropic({ maxRetries: 1 });
  return client;
}
