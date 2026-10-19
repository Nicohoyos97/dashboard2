// Which ledger account stands behind each account line of the P&L, and
// whether it carries the same figure. Both documents come out of the same
// QuickBooks file, so an account appears under the same name in both — but the
// P&L reached us through extraction, which may split "6300 - Utilities" into a
// number and a name, change a dash or drop a space. The key below absorbs
// exactly that and nothing more: an account matches on its number and name, or
// on its name alone when only one ledger account carries it.
//
// The amounts must be equal to the cent. The client is told the transactions
// add up to the figure on their statement; a near miss is a mismatch.
import type { LineNode } from '@/lib/reports/types';

export type LedgerAccountTotal = {
  id: string;
  name: string;
  parentId: string | null;
  /** Own transactions plus every sub-account's, as reconcile.ts computes it. */
  totalCents: number;
};

export type LineMatchStatus = 'matched' | 'mismatch' | 'missing';

export type LineMatch = {
  lineId: string;
  lineName: string;
  statementCents: number;
  accountId: string | null;
  accountName: string | null;
  ledgerCents: number | null;
  status: LineMatchStatus;
};

export type LedgerMatch = {
  lines: LineMatch[];
  /** Ledger accounts no P&L line points at, nor sits above: balance sheet, equity, or not on the statement. */
  unmatched: LedgerAccountTotal[];
  passed: boolean;
};

/** "6300 - Utilities", "6300 Utilities" and "6300-utilities" are one key. */
export function accountKey(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** The key without its leading account number: "6300 utilities" → "utilities". */
function nameKey(text: string): string {
  return accountKey(text).replace(/^\d+\s+/, '');
}

/** The P&L's account lines: everything that is neither a heading nor a total, with a figure. */
export function statementAccountLines(roots: readonly LineNode[]): LineNode[] {
  const out: LineNode[] = [];
  const walk = (nodes: readonly LineNode[]) => {
    for (const node of nodes) {
      if (node.children.length > 0) walk(node.children);
      else if (!node.isSection && !node.isTotal && node.currentCents !== null && node.currentCents !== 0) out.push(node);
    }
  };
  walk(roots);
  return out;
}

function index(accounts: readonly LedgerAccountTotal[], key: (name: string) => string): Map<string, LedgerAccountTotal[]> {
  const map = new Map<string, LedgerAccountTotal[]>();
  for (const account of accounts) {
    const k = key(account.name);
    map.set(k, [...(map.get(k) ?? []), account]);
  }
  return map;
}

export function matchLedger(roots: readonly LineNode[], accounts: readonly LedgerAccountTotal[]): LedgerMatch {
  const byFull = index(accounts, accountKey);
  const byName = index(accounts, nameKey);
  const used = new Set<string>();

  const lines = statementAccountLines(roots).map((line): LineMatch => {
    const label = line.accountNumber ? `${line.accountNumber} ${line.accountName}` : line.accountName;
    const full = byFull.get(accountKey(label)) ?? [];
    const named = byName.get(nameKey(label)) ?? [];
    const account = full.length === 1 ? full[0] : named.length === 1 ? named[0] : undefined;
    const statementCents = line.currentCents ?? 0;
    if (!account) {
      return { lineId: line.id, lineName: line.accountName, statementCents, accountId: null, accountName: null, ledgerCents: null, status: 'missing' };
    }
    used.add(account.id);
    return {
      lineId: line.id,
      lineName: line.accountName,
      statementCents,
      accountId: account.id,
      accountName: account.name,
      ledgerCents: account.totalCents,
      status: account.totalCents === statementCents ? 'matched' : 'mismatch',
    };
  });

  // A parent whose sub-accounts carry the P&L lines is matched through them.
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const covered = new Set(used);
  for (const id of used) {
    let parent = byId.get(id)?.parentId ?? null;
    while (parent && !covered.has(parent)) {
      covered.add(parent);
      parent = byId.get(parent)?.parentId ?? null;
    }
  }
  const unmatched = accounts.filter((a) => !covered.has(a.id));

  return { lines, unmatched, passed: lines.length > 0 && lines.every((l) => l.status === 'matched') };
}
