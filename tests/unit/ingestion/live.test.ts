// @vitest-environment node
// Opt-in end-to-end check against the real API: ANTHROPIC_LIVE_TESTS=1 pnpm test live
// (needs ANTHROPIC_API_KEY, ANTHROPIC_FAST_MODEL and ANTHROPIC_REASONING_MODEL). Skipped otherwise.
import Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it } from 'vitest';

import { runPdfPipeline } from '@/lib/ingestion/pipeline';

import { must, readFixture } from './helpers/anthropic-mock';

const live = process.env.ANTHROPIC_LIVE_TESTS === '1';
const maybe = live ? it : it.skip;

describe('live ingestion (ANTHROPIC_LIVE_TESTS=1)', () => {
  maybe(
    'classifies and extracts the letter + P&L fixture end to end',
    async () => {
      const output = await runPdfPipeline({ pdf: readFixture('letter-and-pnl.pdf'), anthropic: new Anthropic() });
      expect(output.pages.map((page) => page.kind)).toEqual(['firm_letter', 'financial_statement', 'financial_statement']);
      const result = must(output.results[0]);
      expect(result.kind).toBe('financial_statement');
      if (result.kind !== 'financial_statement') return;
      expect(result.pages).toEqual([2, 3]);
      expect(result.data.lines.find((line) => /^net income/i.test(line.account_name))?.current).toBe('38344.90');
      expect(result.reconciliation.passed).toBe(true);
      expect(output.usage.inputTokens).toBeGreaterThan(0);
    },
    600_000,
  );
});
