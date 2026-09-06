// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { HERO_WORDS } from '@/components/chat/hero-words';

// The hero question is a sentence split across a translation and four words
// that take turns finishing it. A missing key renders as "Nick.heroWordSales"
// on the page and nothing else notices, and a word without its question mark
// leaves the sentence hanging, so both are checked here rather than in a
// browser that would still be green.
const messages = (locale: string) =>
  JSON.parse(readFileSync(resolve(process.cwd(), `messages/${locale}.json`), 'utf8'))
    .Nick as Record<string, string>;

describe('the hero question', () => {
  for (const locale of ['en', 'es']) {
    it(`is complete in ${locale}`, () => {
      const nick = messages(locale);
      expect(nick.heroQuestionLead).toBeTruthy();
      // The lead runs straight into the word, so it keeps its trailing space.
      expect(nick.heroQuestionLead).toMatch(/ $/);
      for (const key of HERO_WORDS) {
        expect(nick[key], `${locale}.${key}`).toBeTruthy();
        expect(nick[key], `${locale}.${key} ends the question`).toMatch(/\?$/);
      }
    });
  }

  it('cycles the four things a client comes to ask about', () => {
    expect(HERO_WORDS).toHaveLength(4);
    expect(new Set(HERO_WORDS).size).toBe(4);
  });
});
