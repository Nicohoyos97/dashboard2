// Putting a range's pieces together (lib/reports/range.ts): one statement
// whose lines are matched across the pieces by their path — section, parent
// account, account — and whose figures are the pieces' added.
import { sumCents } from '@/lib/money';

import type { RangePiece } from './range';
import { normalizeName } from './sections';
import { buildTree } from './tree';
import type { LineNode, LineRow } from './types';

export type SlicedPiece = {
  piece: RangePiece;
  rows: readonly LineRow[];
  /** Line id → the figure for the piece's days: the printed one for a whole statement. */
  values: ReadonlyMap<string, number | null>;
};

export type ComposedRange = {
  /** The range's statement: one line per account path, figures added across the pieces. */
  rows: LineRow[];
  /** Line id of the range's statement → the line of each piece it adds up. */
  sources: Map<string, { piece: number; lineId: string }[]>;
};

/** "6300 - Utilities", "6300 Utilities" and a number printed apart are one account. */
function accountText(row: Pick<LineRow, 'accountNumber' | 'accountName'>): string {
  return normalizeName(`${row.accountNumber ?? ''} ${row.accountName}`)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** A short id that stays the same for the same account path, whatever the range. */
export function rangeLineId(key: string): string {
  // cyrb53: 53 bits, so a statement's hundred lines never meet by chance.
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let index = 0; index < key.length; index += 1) {
    const code = key.charCodeAt(index);
    h1 = Math.imul(h1 ^ code, 2654435761);
    h2 = Math.imul(h2 ^ code, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return `r${(4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)}`;
}

type Keyed = { key: string; parentKey: string | null; node: LineNode };

function keyed(roots: readonly LineNode[]): Keyed[] {
  const out: Keyed[] = [];
  const visit = (nodes: readonly LineNode[], parentKey: string | null) => {
    const seen = new Map<string, number>();
    for (const node of nodes) {
      const base = `${parentKey === null ? '' : `${parentKey} › `}${node.isTotal ? 'total ' : ''}${accountText(node)}`;
      const count = (seen.get(base) ?? 0) + 1;
      seen.set(base, count);
      // The same name twice under one heading stays two lines.
      const key = count === 1 ? base : `${base} #${count}`;
      out.push({ key, parentKey, node });
      visit(node.children, key);
    }
  };
  visit(roots, null);
  return out;
}

/** Order-preserving union: each list keeps its own order, the first list wins ties. */
function mergeOrder(lists: readonly (readonly string[])[]): string[] {
  const merged: string[] = [];
  for (const list of lists) {
    let after = -1;
    for (const key of list) {
      const at = merged.indexOf(key);
      if (at >= 0) {
        after = at;
        continue;
      }
      merged.splice(after + 1, 0, key);
      after += 1;
    }
  }
  return merged;
}

/**
 * The range's statement. Lines are matched across the pieces by their path —
 * section, parent account, account — and their figures added; a line only
 * some pieces print adds up only those. Null when one piece prints an account
 * as a single line and another breaks it into sub-accounts: the two cannot be
 * added without deciding which shape is right.
 */
export function composeRange(pieces: readonly SlicedPiece[]): ComposedRange | null {
  type Merged = { key: string; parentKey: string | null; nodes: { piece: number; node: LineNode }[] };
  const byKey = new Map<string, Merged>();
  const childOrder = new Map<string | null, string[][]>();

  // Newest first: the latest statement's order leads, older lines slot in beside their neighbours.
  const order = pieces.map((_, index) => index).reverse();
  for (const index of order) {
    const lines = keyed(buildTree(pieces[index]!.rows));
    const lists = new Map<string | null, string[]>();
    for (const { key, parentKey, node } of lines) {
      const entry = byKey.get(key) ?? { key, parentKey, nodes: [] };
      entry.nodes.push({ piece: index, node });
      byKey.set(key, entry);
      lists.set(parentKey, [...(lists.get(parentKey) ?? []), key]);
    }
    for (const [parentKey, list] of lists) childOrder.set(parentKey, [...(childOrder.get(parentKey) ?? []), list]);
  }

  // An empty heading beside a group is harmless; an account with a figure
  // beside the same account broken into sub-accounts is not.
  for (const entry of byKey.values()) {
    const group = entry.nodes.some(({ node }) => node.children.length > 0);
    const figure = entry.nodes.some(({ piece, node }) => node.children.length === 0 && !node.isTotal && (pieces[piece]!.values.get(node.id) ?? 0) !== 0);
    if (group && figure) return null;
  }

  const rows: LineRow[] = [];
  const sources = new Map<string, { piece: number; lineId: string }[]>();
  const emit = (parentKey: string | null, depth: number) => {
    for (const key of mergeOrder(childOrder.get(parentKey) ?? [])) {
      const entry = byKey.get(key);
      if (!entry) continue;
      const id = rangeLineId(key);
      const first = entry.nodes[0]!.node;
      const figures = entry.nodes
        .map(({ piece, node }) => pieces[piece]!.values.get(node.id) ?? null)
        .filter((value): value is number => value !== null);
      rows.push({
        id,
        parentLineId: parentKey === null ? null : rangeLineId(parentKey),
        position: rows.length,
        depth,
        section: entry.nodes.find(({ node }) => node.section !== null)?.node.section ?? null,
        accountName: first.accountName,
        accountNumber: first.accountNumber,
        currentCents: figures.length === 0 ? null : sumCents(figures),
        priorCents: null,
        isSection: entry.nodes.some(({ node }) => node.isSection),
        isTotal: first.isTotal,
        pageNumber: null,
        confidence: null,
      });
      sources.set(
        id,
        entry.nodes.map(({ piece, node }) => ({ piece, lineId: node.id })).sort((a, b) => a.piece - b.piece),
      );
      emit(key, depth + 1);
    }
  };
  emit(null, 0);
  return { rows, sources };
}

/** A piece's lines carrying its own figures, for a chart bar or a per-piece reading. */
export function piecesRows(piece: SlicedPiece): LineRow[] {
  return piece.rows.map((row) => ({ ...row, currentCents: piece.values.get(row.id) ?? null, priorCents: null }));
}
