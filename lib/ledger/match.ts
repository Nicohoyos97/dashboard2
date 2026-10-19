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
//
// A parent account with sub-accounts reaches the P&L in one of two shapes.
// Collapsed, it is one line carrying the parent's total with every
// sub-account's in it, and its transactions are the whole subtree's. Expanded,
// the sub-accounts are lines of their own and the parent's direct postings,
// when it has any, are one more line ("Utilities", or QuickBooks Desktop's
// "Utilities - Other") carrying the parent's own total alone. `accountIds` says
// which accounts' transactions make up the line's figure, so a page that lists
// them can never show $100 of transactions under a $740.40 total.
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
  /** The accounts whose transactions add up to the line: the account and its sub-accounts, or the account alone for its own postings. Empty unless matched. */
  accountIds: string[];
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

/** "utilities other" → "utilities": QuickBooks Desktop's line for a parent's direct postings. */
function withoutOther(key: string): string | null {
  return key.endsWith(' other') ? key.slice(0, -' other'.length) : null;
}

export function matchLedger(roots: readonly LineNode[], accounts: readonly LedgerAccountTotal[]): LedgerMatch {
  const byFull = index(accounts, accountKey);
  const byName = index(accounts, nameKey);
  const children = new Map<string, LedgerAccountTotal[]>();
  for (const account of accounts) {
    if (account.parentId) children.set(account.parentId, [...(children.get(account.parentId) ?? []), account]);
  }
  const subtree = (id: string): string[] => [id, ...(children.get(id) ?? []).flatMap((child) => subtree(child.id))];
  /** The parent's direct postings: its total less every sub-account's. */
  const ownCents = (account: LedgerAccountTotal): number =>
    account.totalCents - (children.get(account.id) ?? []).reduce((sum, child) => sum + child.totalCents, 0);
  const unique = (found: LedgerAccountTotal[] | undefined) => (found?.length === 1 ? found[0] : undefined);
  const used = new Set<string>();

  const lines = statementAccountLines(roots).map((line): LineMatch => {
    const label = line.accountNumber ? `${line.accountNumber} ${line.accountName}` : line.accountName;
    const statementCents = line.currentCents ?? 0;
    const base = { lineId: line.id, lineName: line.accountName, statementCents };
    const account = unique(byFull.get(accountKey(label))) ?? unique(byName.get(nameKey(label)));
    const other = withoutOther(nameKey(label));
    const parentOfOther = account ? undefined : other !== null ? unique(byName.get(other)) : undefined;

    if (account) {
      used.add(account.id);
      const hasChildren = (children.get(account.id) ?? []).length > 0;
      if (account.totalCents === statementCents) {
        return { ...base, accountId: account.id, accountName: account.name, ledgerCents: account.totalCents, status: 'matched', accountIds: subtree(account.id) };
      }
      if (hasChildren && ownCents(account) === statementCents) {
        return { ...base, accountId: account.id, accountName: account.name, ledgerCents: statementCents, status: 'matched', accountIds: [account.id] };
      }
      return { ...base, accountId: account.id, accountName: account.name, ledgerCents: account.totalCents, status: 'mismatch', accountIds: [] };
    }
    if (parentOfOther && (children.get(parentOfOther.id) ?? []).length > 0) {
      used.add(parentOfOther.id);
      const own = ownCents(parentOfOther);
      return {
        ...base,
        accountId: parentOfOther.id,
        accountName: parentOfOther.name,
        ledgerCents: own,
        status: own === statementCents ? 'matched' : 'mismatch',
        accountIds: own === statementCents ? [parentOfOther.id] : [],
      };
    }
    return { ...base, accountId: null, accountName: null, ledgerCents: null, status: 'missing', accountIds: [] };
  });

  // A parent whose sub-accounts carry the P&L lines is matched through them,
  // and the sub-accounts of a collapsed parent through it.
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const covered = new Set([...used, ...lines.flatMap((line) => line.accountIds)]);
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
