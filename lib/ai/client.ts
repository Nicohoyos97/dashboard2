// Server-only Anthropic client. `new Anthropic()` resolves the API key from the
// environment, so the key never has to pass through application code.
import 'server-only';

import Anthropic from '@anthropic-ai/sdk';

export { MODELS, MODEL_DEFAULTS, modelId, modelOptions } from './models';
export type { Effort, ModelOptions, ModelRole } from './models';

let client: Anthropic | null = null;

export function getAnthropic(): Anthropic {
  // One retry: two 240 s attempts stay inside the worker's function budget.
  client ??= new Anthropic({ maxRetries: 1 });
  return client;
}
