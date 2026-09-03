// The statement as a tree: parent/child from `parentLineId`, siblings in
// printed order, variance per line computed here (never by the model).
import { variance } from '@/lib/money';

import { normalizeName } from './sections';
import type { LineNode, LineRow } from './types';

function deltaOf(row: LineRow): { deltaCents: number | null; deltaPct: number | null } {
  if (row.currentCents === null || row.priorCents === null) return { deltaCents: null, deltaPct: null };
  const { deltaCents, pct } = variance(row.currentCents, row.priorCents);
  return { deltaCents, deltaPct: pct };
}

/** True when following `parentLineId` from `id` never returns to `id` and ends at a known root. */
function hasSoundAncestry(id: string, parentOf: Map<string, string | null>): boolean {
  const seen = new Set<string>();
  let cursor: string | null = id;
  while (cursor !== null) {
    if (seen.has(cursor)) return false;
    seen.add(cursor);
    const next = parentOf.get(cursor);
    if (next === undefined) return false;
    cursor = next;
  }
  return true;
}

export function buildTree(rows: readonly LineRow[]): LineNode[] {
  const nodes = new Map<string, LineNode>();
  const parentOf = new Map<string, string | null>();
  for (const row of rows) {
    nodes.set(row.id, { ...row, children: [], ...deltaOf(row) });
    parentOf.set(row.id, row.parentLineId);
  }

  const roots: LineNode[] = [];
  for (const node of nodes.values()) {
    // A line whose parent is missing from the row set, or whose ancestry
    // loops, is shown at the top level rather than silently dropped: every
    // printed line must stay reachable.
    const parent = node.parentLineId === null ? undefined : nodes.get(node.parentLineId);
    if (parent && hasSoundAncestry(node.id, parentOf)) parent.children.push(node);
    else roots.push(node);
  }

  const byPosition = (a: LineNode, b: LineNode) => a.position - b.position;
  roots.sort(byPosition);
  for (const node of nodes.values()) node.children.sort(byPosition);
  return roots;
}

export type FlattenOptions = { hideZero?: boolean; query?: string };

function isZero(node: LineNode): boolean {
  return (node.currentCents ?? 0) === 0 && (node.priorCents ?? 0) === 0;
}

function matches(node: LineNode, query: string): boolean {
  if (normalizeName(node.accountName).includes(query)) return true;
  return node.accountNumber !== null && node.accountNumber.toLowerCase().includes(query);
}

function collect(node: LineNode, depth: number, inherited: boolean, options: { hideZero: boolean; query: string }): LineNode[] {
  // A match keeps its whole subtree (searching "Payroll" shows the group's
  // lines) and all of its ancestors (so the hierarchy still reads correctly).
  const matched = inherited || options.query === '' || matches(node, options.query);
  const descendants = node.children.flatMap((child) => collect(child, depth + 1, matched, options));
  const selfVisible = matched && !(options.hideZero && isZero(node));
  if (!selfVisible && descendants.length === 0) return [];
  return [{ ...node, depth }, ...descendants];
}

/**
 * Visible rows in printed order. `depth` is recomputed from the tree so the
 * UI indents by structure, not by the extractor's hint. Section rows survive
 * `hideZero` while any line under them is visible.
 */
export function flattenTree(nodes: readonly LineNode[], options: FlattenOptions = {}): LineNode[] {
  const settings = { hideZero: options.hideZero ?? false, query: normalizeName(options.query ?? '') };
  return nodes.flatMap((node) => collect(node, 0, false, settings));
}

export function findLine(nodes: readonly LineNode[], id: string): LineNode | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    const inner = findLine(node.children, id);
    if (inner) return inner;
  }
  return null;
}
