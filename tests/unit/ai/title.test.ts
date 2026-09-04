// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { matchesKeywords, titleFromMessage } from '@/lib/ai/nick/title';

describe('titleFromMessage', () => {
  it('keeps a short question as is, with whitespace collapsed', () => {
    expect(titleFromMessage('  Why did   net income change?\n')).toBe('Why did net income change?');
  });

  it('cuts a long question at a word boundary with an ellipsis', () => {
    const title = titleFromMessage(
      'Can you explain why my payroll expense grew faster than revenue this quarter compared to last year?',
    );
    expect(title.length).toBeLessThanOrEqual(57);
    expect(title.endsWith('…')).toBe(true);
    expect(title).not.toMatch(/\s…$/);
    expect(title).toBe('Can you explain why my payroll expense grew faster than…');
  });
});

describe('matchesKeywords', () => {
  it('requires every keyword, ignoring case and order', () => {
    expect(matchesKeywords('Why did net income change?', 'income net')).toBe(true);
    expect(matchesKeywords('Why did net income change?', 'income payroll')).toBe(false);
    expect(matchesKeywords('Download the P&L', '  ')).toBe(true);
  });
});
