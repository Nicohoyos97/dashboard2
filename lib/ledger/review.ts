// A General Ledger against the Profit & Loss it explains. One function, three
// readers: the firm's review page, publishBlockers and publishDocument — so
// what the page shows, what the button allows and what the client ends up
// seeing can never disagree.
//
// The rule: a ledger is published only beside the published P&L of exactly
// its period, on the same basis, with every P&L account line carried by one
// ledger account at exactly the same figure.
import { toCents } from '@/lib/money';
import { loadReportLines } from '@/lib/portal/load';
import { buildTree } from '@/lib/reports/tree';
import type { createClient } from '@/lib/supabase/server';

import { type LedgerAccountTotal, type LedgerMatch, matchLedger } from './match';

type Db = Awaited<ReturnType<typeof createClient>>;

export type LedgerBlocker =
  | 'publishBlockedLedgerNoStatement'
  | 'publishBlockedLedgerBasis'
  | 'publishBlockedLedgerMatch';

export type LedgerRow = {
  id: string;
  business_entity_id: string;
  period_start: string;
  period_end: string;
  basis: string | null;
};

export type LedgerReview = {
  statement: { id: string; basis: string | null } | null;
  match: LedgerMatch | null;
  blocker: LedgerBlocker | null;
};

/** Every account of a ledger, with the total the parse computed. Firm-side: RLS hides the rest from a client. */
export async function loadLedgerAccountTotals(supabase: Db, ledgerId: string): Promise<LedgerAccountTotal[]> {
  const { data, error } = await supabase
    .from('ledger_accounts')
    .select('id, name, parent_id, total')
    .eq('ledger_id', ledgerId)
    .order('position');
  if (error) throw new Error('ledger_accounts_read_failed');
  return (data ?? []).map((a) => ({ id: a.id, name: a.name, parentId: a.parent_id, totalCents: toCents(a.total) }));
}

export async function reviewLedger(supabase: Db, ledger: LedgerRow): Promise<LedgerReview> {
  const { data: statement } = await supabase
    .from('financial_reports')
    .select('id, basis')
    .eq('business_entity_id', ledger.business_entity_id)
    .eq('report_type', 'profit_and_loss')
    .eq('status', 'published')
    .eq('period_start', ledger.period_start)
    .eq('period_end', ledger.period_end)
    .limit(1)
    .maybeSingle();
  if (!statement) return { statement: null, match: null, blocker: 'publishBlockedLedgerNoStatement' };

  const [lines, accounts] = await Promise.all([
    loadReportLines(supabase, ledger.business_entity_id, statement.id),
    loadLedgerAccountTotals(supabase, ledger.id),
  ]);
  const match = matchLedger(buildTree(lines), accounts);
  const basisDiffers = ledger.basis !== null && statement.basis !== null && ledger.basis !== statement.basis;
  return {
    statement,
    match,
    blocker: basisDiffers ? 'publishBlockedLedgerBasis' : match.passed ? null : 'publishBlockedLedgerMatch',
  };
}
