// @vitest-environment node
import { describe, expect, it } from 'vitest';

import {
  CitationRegistry,
  checkAnswer,
  citationLabel,
  hasFinancialFigure,
  markersIn,
  stripMarkers,
} from '@/lib/ai/nick/citations';

function record(label: string, lineId: string | null = null) {
  return {
    label,
    reportId: 'r1',
    documentVersionId: 'v1',
    lineId,
    page: 3,
    periodStart: '2026-01-01',
    periodEnd: '2026-06-30',
    source: 'firm_document' as const,
    href: '/statements/profit-and-loss?period=2026-01-01_2026-06-30',
  };
}

describe('CitationRegistry', () => {
  it('assigns sequential keys and returns the same key for an identical figure', () => {
    const registry = new CitationRegistry();
    const first = registry.add(record('Payroll', 'l1'));
    const again = registry.add(record('Payroll', 'l1'));
    const second = registry.add(record('Rent', 'l2'));
    expect(first).toBe('c1');
    expect(again).toBe('c1');
    expect(second).toBe('c2');
    expect(registry.size).toBe(2);
    expect(registry.get('c2')?.label).toBe('Rent');
  });
});

describe('markersIn / stripMarkers', () => {
  it('lists markers once, in order of first appearance', () => {
    expect(markersIn('Revenue was $10 [c2], costs $4 [c1], net $6 [c2].')).toEqual(['c2', 'c1']);
  });

  it('strips markers and the space before them', () => {
    expect(stripMarkers('Net income was $12,450.00 [c2].')).toBe('Net income was $12,450.00.');
  });
});

describe('hasFinancialFigure', () => {
  it.each([
    ['Revenue was $12,450.00', true],
    ['Margin is 42.5%', true],
    ['Costs rose to 1,200', true],
    ['Balance of 125000 dollars', true],
    ['Revenue was 12.5 million', true],
    ['See page 3 of the June 2026 statement', false],
    ['In Q2 2026 there were 3 reminders', false],
    ['Hello! How can I help today?', false],
    ['Here is your link: /api/documents/4d1c3e1a-9f0e-4c7b-9a0c-000000123456/download', false],
    [
      'Export 7f3a9c12-1111-4222-8333-444455556666 is ready at https://app.example.com/api/exports/x/download',
      false,
    ],
  ])('%s → %s', (text, expected) => {
    expect(hasFinancialFigure(text)).toBe(expected);
  });
});

describe('checkAnswer', () => {
  it('accepts an answer whose figures carry known markers and resolves them in order', () => {
    const registry = new CitationRegistry();
    registry.add(record('Revenue', 'l1'));
    registry.add(record('Net income', 'l2'));
    const check = checkAnswer(
      'Net income was $12,450.00 [c2] on revenue of $80,000.00 [c1].',
      registry,
    );
    expect(check.ok).toBe(true);
    if (check.ok) expect(check.citations.map((c) => c.label)).toEqual(['Net income', 'Revenue']);
  });

  it('rejects a figure without any marker', () => {
    const registry = new CitationRegistry();
    registry.add(record('Revenue', 'l1'));
    expect(checkAnswer('Net income was $12,450.00.', registry)).toEqual({
      ok: false,
      reason: 'uncited_figure',
      unknown: [],
    });
  });

  it('rejects a marker the tools never issued', () => {
    const registry = new CitationRegistry();
    registry.add(record('Revenue', 'l1'));
    expect(checkAnswer('Net income was $12,450.00 [c9].', registry)).toEqual({
      ok: false,
      reason: 'unknown_marker',
      unknown: ['c9'],
    });
  });

  it('accepts prose with no figures and no markers', () => {
    const check = checkAnswer(
      'I can explain any line on your statement — which one?',
      new CitationRegistry(),
    );
    expect(check).toEqual({ ok: true, citations: [] });
  });
});

describe('citationLabel', () => {
  it('joins the present parts with a middle dot', () => {
    expect(citationLabel(['Profit & Loss', 'Q2 2026', null, 'Page 3', '', 'Payroll Expense'])).toBe(
      'Profit & Loss · Q2 2026 · Page 3 · Payroll Expense',
    );
  });
});

describe('checkAnswer — every figure needs its own marker', () => {
  function registryWith(n: number) {
    const registry = new CitationRegistry();
    for (let i = 0; i < n; i += 1) registry.add(record(`Figure ${i}`, `l${i}`));
    return registry;
  }

  it('rejects an answer where one marker covers several figures', () => {
    // The gate used to run the figure check only when the answer had NO marker,
    // so a single [c1] exempted every other number in the message.
    const check = checkAnswer(
      'Revenue was $80,000.00 [c1] and your net income was $19,500.00, so your margin is about 24%.',
      registryWith(1),
    );
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.reason).toBe('uncited_figure');
  });

  it('accepts the same answer once every figure carries its own marker', () => {
    const check = checkAnswer(
      'Revenue was $80,000.00 [c1], net income $19,500.00 [c2], a margin of 24% [c3].',
      registryWith(3),
    );
    expect(check.ok).toBe(true);
  });

  it('rejects bare integers a reader would read as money', () => {
    // The figure pattern only recognised >= 5 digits, a decimal, a grouping
    // comma or a currency symbol, so plain-language amounts passed uncited —
    // exactly the phrasing the system prompt asks for.
    for (const answer of [
      'Your net income last month was 4500 dollars.',
      'Revenue was 9800 and expenses 7200, so you kept 2600.',
      'You owe 950 in sales tax.',
    ]) {
      const check = checkAnswer(answer, registryWith(3));
      expect(check.ok, answer).toBe(false);
      if (!check.ok) expect(check.reason).toBe('uncited_figure');
    }
  });

  it('does not mistake dates, years, page numbers or small counts for figures', () => {
    for (const answer of [
      'Your Q3 filing is due on 2026-09-30.',
      'That statement covers 2025 and 2026.',
      'I found 3 published statements; the detail is on page 12.',
    ]) {
      expect(checkAnswer(answer, registryWith(1)).ok, answer).toBe(true);
    }
  });

  it('does not treat digits inside a citation marker as an uncited figure', () => {
    const registry = registryWith(140);
    expect(checkAnswer('Payroll was $4,000.00 [c137].', registry).ok).toBe(true);
  });

  it('still accepts a download link, whose path carries digits', () => {
    const check = checkAnswer(
      'Here is the export: https://example.com/exports/2026/report-12345.csv',
      registryWith(1),
    );
    expect(check.ok).toBe(true);
  });
});
