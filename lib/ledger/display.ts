// How a ledger transaction reads in the client portal. Pure, so the browser
// components share it with the server.
//
// The title is the payee QuickBooks recorded (the export's Name) and, when
// there is none, the description exactly as the bank printed it. Nothing is
// rewritten or cleaned up: a tidied-up name is a name nobody wrote.

export type LedgerTxn = {
  id: string;
  accountId: string;
  date: string;
  type: string | null;
  num: string | null;
  name: string | null;
  description: string | null;
  split: string | null;
  amountCents: number;
};

/** QuickBooks transaction types the portal names in plain words; any other prints as QuickBooks wrote it. */
export const KNOWN_TYPES = [
  'deposit',
  'expense',
  'journal_entry',
  'transfer',
  'check',
  'bill',
  'bill_payment',
  'invoice',
  'payment',
  'sales_receipt',
  'credit_card_expense',
  'credit_card_credit',
  'refund',
  'credit_memo',
  'vendor_credit',
] as const;

export type KnownType = (typeof KNOWN_TYPES)[number];

export function knownType(type: string | null): KnownType | null {
  const slug = (type ?? '')
    .toLowerCase()
    .replace(/\(.*\)/, '')
    .trim()
    .replace(/[^a-z]+/g, '_');
  return (KNOWN_TYPES as readonly string[]).includes(slug) ? (slug as KnownType) : null;
}

/** A bookkeeper's adjustment rather than money moving. */
export function isAdjustment(tx: Pick<LedgerTxn, 'type'>): boolean {
  return knownType(tx.type) === 'journal_entry';
}

export function txnTitle(tx: Pick<LedgerTxn, 'name' | 'description'>): { title: string | null; detail: string | null } {
  const name = tx.name?.trim() || null;
  const description = tx.description?.trim() || null;
  if (name) return { title: name, detail: description && description !== name ? description : null };
  return { title: description, detail: null };
}

export type PayeeGroup = { label: string; count: number; totalCents: number };

/** Transactions by who they were with, largest first. `untitled` labels the ones with neither a name nor a description. */
export function groupByPayee(txns: readonly LedgerTxn[], untitled: (tx: LedgerTxn) => string): PayeeGroup[] {
  const groups = new Map<string, PayeeGroup>();
  for (const tx of txns) {
    const label = txnTitle(tx).title ?? untitled(tx);
    const group = groups.get(label) ?? { label, count: 0, totalCents: 0 };
    group.count += 1;
    group.totalCents += tx.amountCents;
    groups.set(label, group);
  }
  return [...groups.values()].sort((a, b) => Math.abs(b.totalCents) - Math.abs(a.totalCents) || a.label.localeCompare(b.label));
}
