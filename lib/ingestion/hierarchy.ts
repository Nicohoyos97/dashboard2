// Turns the model's flat line list into a validated tree: refs unique,
// parents present, no cycles, depth recomputed from the parents (the model's
// depth is a hint, the structure is the truth), amounts converted to cents.
import { toCents } from '@/lib/money';

import { IngestionError } from './errors';
import type { FinancialStatementLine } from './schemas/financial-statement';

export type HierarchyRow = FinancialStatementLine & {
  position: number;
  parentIndex: number | null;
  currentCents: number | null;
  priorCents: number | null;
};

export type Hierarchy = { rows: HierarchyRow[]; warnings: string[] };

export function buildHierarchy(lines: readonly FinancialStatementLine[]): Hierarchy {
  const indexByRef = new Map<string, number>();
  lines.forEach((line, index) => {
    if (indexByRef.has(line.ref)) throw new IngestionError('schema_invalid', `duplicate ref ${line.ref}`);
    indexByRef.set(line.ref, index);
  });

  const parentIndexes: (number | null)[] = lines.map((line) => {
    if (line.parent_ref === null) return null;
    const parent = indexByRef.get(line.parent_ref);
    if (parent === undefined) throw new IngestionError('schema_invalid', `unknown parent_ref ${line.parent_ref}`);
    return parent;
  });

  const depths = new Map<number, number>();
  const depthOf = (index: number, trail: Set<number>): number => {
    const known = depths.get(index);
    if (known !== undefined) return known;
    if (trail.has(index)) throw new IngestionError('schema_invalid', `cycle at ${lines[index]?.ref ?? index}`);
    trail.add(index);
    const parent = parentIndexes[index];
    const depth = parent === null || parent === undefined ? 0 : depthOf(parent, trail) + 1;
    depths.set(index, depth);
    return depth;
  };

  const warnings: string[] = [];
  const rows = lines.map((line, position): HierarchyRow => {
    const depth = depthOf(position, new Set());
    if (depth !== line.depth) warnings.push(`${line.ref}: depth corrected from ${line.depth} to ${depth}`);
    return {
      ...line,
      depth,
      position,
      parentIndex: parentIndexes[position] ?? null,
      currentCents: line.current === null ? null : toCents(line.current),
      priorCents: line.prior === undefined || line.prior === null ? null : toCents(line.prior),
    };
  });
  return { rows, warnings };
}
