// Model configuration for the two roles the app uses. IDs are configuration,
// never code (INITIAL_PROMPT.md §4), so they are read lazily from the
// environment with a clear error when missing. Kept free of `server-only` so
// unit tests can import it; the Anthropic client itself lives in ./client.ts.

export type ModelRole = 'fast' | 'reasoning';
export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';
export type ModelOptions = { model: string; maxTokens: number; effort: Effort };

const ENV_KEYS: Record<ModelRole, string> = {
  fast: 'ANTHROPIC_FAST_MODEL',
  reasoning: 'ANTHROPIC_REASONING_MODEL',
};

// Classification is cheap and mechanical; extraction of dense financial tables
// is where accuracy is bought. Adaptive thinking is the models' default, so no
// `thinking` parameter is sent — effort alone controls depth. 16K output
// tokens keeps a non-streaming extraction inside the worker's 300 s budget;
// longer statements are extracted in page chunks (lib/ingestion/extract.ts).
export const MODEL_DEFAULTS: Record<ModelRole, { maxTokens: number; effort: Effort }> = {
  fast: { maxTokens: 8000, effort: 'low' },
  reasoning: { maxTokens: 16000, effort: 'high' },
};

export function modelId(role: ModelRole): string {
  const key = ENV_KEYS[role];
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing ${key} — model IDs are configuration; set it in .env.local`);
  }
  return value;
}

export const MODELS = {
  get fast(): string {
    return modelId('fast');
  },
  get reasoning(): string {
    return modelId('reasoning');
  },
};

export function modelOptions(role: ModelRole, model?: string): ModelOptions {
  return { model: model ?? modelId(role), ...MODEL_DEFAULTS[role] };
}
