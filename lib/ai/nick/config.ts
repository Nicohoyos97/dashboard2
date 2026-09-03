// Cost controls for Nick (INITIAL_PROMPT.md §10): iteration cap, history
// window, output budgets per model role, and the per-entity daily token
// budget. Everything is a named constant or an environment variable so the
// firm can tune spend without touching the loop.
import type { Effort } from '@/lib/ai/models';

export const NICK_LIMITS = {
  maxToolIterations: 8,
  historyMessages: 20,
  maxMessageChars: 2000,
  // Tool results are small and answers are short prose; these cap runaway
  // output without truncating a normal explanation.
  maxTokens: { fast: 4000, reasoning: 8000 } as const,
  effort: { fast: 'low', reasoning: 'high' } as const satisfies Record<
    'fast' | 'reasoning',
    Effort
  >,
  // Non-streaming router call; the answer itself streams.
  routerMaxTokens: 400,
  exportTtlHours: 24,
  // Lines returned by a statement tool in `lines` detail before truncation.
  maxStatementLines: 80,
} as const;

const DEFAULT_DAILY_TOKEN_BUDGET = 2_000_000;

/** Input + output tokens one business may spend per UTC day; `NICK_DAILY_TOKEN_BUDGET` overrides. */
export function dailyTokenBudget(): number {
  const raw = process.env.NICK_DAILY_TOKEN_BUDGET;
  const value = raw ? Number(raw) : Number.NaN;
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : DEFAULT_DAILY_TOKEN_BUDGET;
}
