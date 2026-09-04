// Comparing a statement against another published statement, rather than
// against the comparative column its own document happens to print.
//
// The two are not the same fact and the portal must not blur them. A printed
// comparative is part of the document the firm published; a chosen comparison
// is this app putting two published statements side by side. Both are firm
// documents of the same type and currency — nothing is mixed across sources —
// but the reader has to be told which one they are looking at, so the caller
// carries a `basis` through to the header.
//
// Accounts are matched by their path: the chain of ancestor names down to the
// line's own, normalised. Position cannot be used — two statements order their
// lines independently — and a bare name is ambiguous, because "Total" appears
// under every section.
import { variance } from '@/lib/money';

import type { LineNode } from './types';

export type ComparisonBasis = 'printed_comparative' | 'published_period';

function normalize(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

function pathKey(ancestors: readonly string[], accountName: string): string {
  return [...ancestors, accountName].map(normalize).join(' / ');
}

/** Every line of a tree, keyed by its account path. */
export function amountsByPath(
  nodes: readonly LineNode[],
  ancestors: readonly string[] = [],
  out: Map<string, number | null> = new Map(),
): Map<string, number | null> {
  for (const node of nodes) {
    const key = pathKey(ancestors, node.accountName);
    // First writer wins: a statement that prints the same path twice is
    // malformed, and silently taking the last one would be a quiet choice.
    if (!out.has(key)) out.set(key, node.currentCents);
    amountsByPath(node.children, [...ancestors, node.accountName], out);
  }
  return out;
}

/**
 * The same tree, with the prior column and the deltas taken from `comparison`.
 *
 * A line the comparison statement does not print gets a null prior and no
 * delta — not a zero, which would read as "it was nothing" rather than "that
 * statement does not say".
 */
export function withComparison(
  nodes: readonly LineNode[],
  comparison: Map<string, number | null>,
  ancestors: readonly string[] = [],
): LineNode[] {
  return nodes.map((node) => {
    const priorCents = comparison.get(pathKey(ancestors, node.accountName)) ?? null;
    const both = node.currentCents !== null && priorCents !== null;
    const change = both ? variance(node.currentCents!, priorCents) : null;
    return {
      ...node,
      priorCents,
      deltaCents: change ? change.deltaCents : null,
      deltaPct: change ? change.pct : null,
      children: withComparison(node.children, comparison, [...ancestors, node.accountName]),
    };
  });
}

/** True when any line ends up with something to compare against. */
export function hasAnyPrior(nodes: readonly LineNode[]): boolean {
  return nodes.some((node) => node.priorCents !== null || hasAnyPrior(node.children));
}
