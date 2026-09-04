// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { amountsByPath, hasAnyPrior, withComparison } from '@/lib/reports/compare';
import type { LineNode } from '@/lib/reports/types';

function node(accountName: string, currentCents: number | null, children: LineNode[] = []): LineNode {
  return {
    id: accountName,
    reportId: 'r',
    parentLineId: null,
    position: 0,
    depth: 0,
    section: null,
    accountName,
    accountNumber: null,
    currentCents,
    priorCents: null,
    isSection: children.length > 0,
    isTotal: accountName.startsWith('Total'),
    pageNumber: null,
    sourceText: null,
    confidence: null,
    children,
    deltaCents: null,
    deltaPct: null,
  } as LineNode;
}

const current = [
  node('Income', null, [node('Coffee & food sales', 37_666_33), node('Total Income', 42_802_65)]),
  node('Expenses', null, [node('Rent', 4_121_66), node('Total Expenses', 18_231_20)]),
];

describe('amountsByPath', () => {
  it('keys every line by its path, so a repeated name under two sections stays distinct', () => {
    const map = amountsByPath(current);
    expect(map.get('income / total income')).toBe(42_802_65);
    expect(map.get('expenses / total expenses')).toBe(18_231_20);
    // A bare "Total Income" would collide with "Total Expenses" if only the
    // leaf name were used.
    expect(map.has('total income')).toBe(false);
  });

  it('is case- and whitespace-insensitive, because two statements type it differently', () => {
    const other = [node('INCOME', null, [node('  Coffee &   food sales ', 1)])];
    expect(amountsByPath(other).get('income / coffee & food sales')).toBe(1);
  });
});

describe('withComparison', () => {
  const previous = amountsByPath([
    node('Income', null, [node('Coffee & food sales', 35_169_75), node('Total Income', 39_965_62)]),
    node('Expenses', null, [node('Rent', 4_616_76), node('Total Expenses', 21_776_54)]),
  ]);

  it('takes the prior column and the deltas from the statement being compared', () => {
    const [income] = withComparison(current, previous);
    const sales = income!.children[0]!;
    expect(sales.priorCents).toBe(35_169_75);
    expect(sales.deltaCents).toBe(2_496_58);
    expect(sales.deltaPct).toBeCloseTo(7.1, 1);
  });

  it('leaves a line the other statement does not print without a prior, not at zero', () => {
    // "It was nothing" and "that statement does not say" are different claims.
    const withNewLine = [node('Income', null, [node('Catering', 5_136_32)])];
    const [income] = withComparison(withNewLine, previous);
    const catering = income!.children[0]!;
    expect(catering.priorCents).toBeNull();
    expect(catering.deltaCents).toBeNull();
    expect(catering.deltaPct).toBeNull();
  });

  it('replaces a prior the document had printed, rather than keeping both', () => {
    const printed = [node('Income', null, [{ ...node('Rent', 100), priorCents: 999_99 } as LineNode])];
    const [income] = withComparison(printed, previous);
    expect(income!.children[0]!.priorCents).toBeNull();
  });

  it('reports whether anything could be compared at all', () => {
    expect(hasAnyPrior(withComparison(current, previous))).toBe(true);
    expect(hasAnyPrior(withComparison(current, new Map()))).toBe(false);
  });
});
