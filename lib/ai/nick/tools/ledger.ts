// "How much did I pay Meta?" — Nick reads the transactions behind the P&L
// accounts, from the General Ledgers the firm published (0026). Every total,
// count and split is computed here; the model only quotes them, each with its
// citation. Money paid (cost and expense accounts) and money received (every
// other P&L account) are never added together: a vendor that is also a
// customer gets two figures, not one meaningless net.
import { citationLabel } from '@/lib/ai/nick/citations';
import { type LedgerTxn, isAdjustment, txnTitle } from '@/lib/ledger/display';
import { ledgerLinks } from '@/lib/ledger/links';
import { loadLedgerDetail, searchLedgerTransactions } from '@/lib/ledger/load';
import { fromCents, sumCents } from '@/lib/money';
import { loadPublishedReports, loadReportLines } from '@/lib/portal/load';
import { pnlExpenseLines } from '@/lib/reports/pnl-expenses';
import { buildTree, flattenTree } from '@/lib/reports/tree';
import type { ReportRow } from '@/lib/reports/types';

import {
  type ShapeContext,
  type ToolContext,
  type ToolResult,
  label,
  money,
  parsePeriodInput,
  periodText,
} from './context';
import type { ToolInput } from './schemas';

export type Side = 'paid' | 'received';

/** A P&L account the client can open, as one month's ledger carries it. */
export type MonthAccount = { lineId: string; lineName: string; side: Side; href: string | null };

/** One published month: its P&L and the ledger accounts behind its lines, by ledger account id. */
export type LedgerMonth = { report: ReportRow; accounts: ReadonlyMap<string, MonthAccount> };

const MAX_MONTHS = 12;
const MAX_TRANSACTIONS = 15;
const MAX_GROUPS = 10;

type Figure = { amount: string; formatted: string; cite: string };

export function transactionSearchOut(
  ctx: ShapeContext,
  query: string,
  months: readonly LedgerMonth[],
  txns: readonly LedgerTxn[],
): ToolResult {
  const first = months.at(-1);
  const last = months[0];
  if (!first || !last) return { available: false, reason: 'no_ledger_for_period' };
  const one = months.length === 1 ? last : null;
  const span = { start: first.report.periodStart, end: last.report.periodEnd };
  const spanLabel = periodText(span.start, span.end, ctx.locale);
  const currency = last.report.currency;

  const located = txns.flatMap((tx) => {
    const month = months.find((m) => m.accounts.has(tx.accountId));
    const account = month?.accounts.get(tx.accountId);
    return month && account ? [{ tx, month, account }] : [];
  });
  const base = {
    available: true,
    query,
    period: { start: span.start, end: span.end, label: spanLabel },
    months: months.map((m) => periodText(m.report.periodStart, m.report.periodEnd, ctx.locale)),
    matches: located.length,
  };
  if (located.length === 0) return { ...base, reason: 'no_matching_transactions' };

  const payeeOf = (tx: LedgerTxn) => txnTitle(tx).title ?? (isAdjustment(tx) ? label(ctx.locale, 'adjustment') : '—');
  const figure = (cents: number, cite: string): Figure => ({ amount: fromCents(cents), formatted: money(ctx, cents, currency), cite });
  const cite = (parts: (string | null)[], extra: { report?: ReportRow; lineId?: string; href?: string | null } = {}) =>
    ctx.registry.add({
      label: citationLabel([label(ctx.locale, 'ledger'), ...parts]),
      reportId: extra.report?.id ?? one?.report.id ?? null,
      documentVersionId: null,
      lineId: extra.lineId ?? null,
      page: null,
      periodStart: extra.report?.periodStart ?? span.start,
      periodEnd: extra.report?.periodEnd ?? span.end,
      source: 'firm_document',
      href: extra.href ?? null,
    });

  const sides = (['paid', 'received'] as const).map((side) => {
    const rows = located.filter((r) => r.account.side === side);
    if (rows.length === 0) return [side, null] as const;
    const total = sumCents(rows.map((r) => r.tx.amountCents));
    return [side, { count: rows.length, total: figure(total, cite([spanLabel, query, label(ctx.locale, side)])) }] as const;
  });

  const accounts = new Map<string, { side: Side; name: string; href: string | null; lineId: string; report: ReportRow; cents: number[] }>();
  for (const { tx, month, account } of located) {
    // Keyed by name: across months the same P&L account is one row.
    const key = `${account.side}:${account.lineName}`;
    const entry = accounts.get(key) ?? { side: account.side, name: account.lineName, href: account.href, lineId: account.lineId, report: month.report, cents: [] };
    entry.cents.push(tx.amountCents);
    accounts.set(key, entry);
  }
  const byAccount = [...accounts.values()]
    .map((a) => {
      const total = sumCents(a.cents);
      return {
        account: a.name,
        side: a.side,
        count: a.cents.length,
        total: figure(total, cite([spanLabel, a.name, query], one ? { report: a.report, lineId: a.lineId, href: a.href } : { href: a.href })),
      };
    })
    .sort((x, y) => Math.abs(Number(y.total.amount)) - Math.abs(Number(x.total.amount)));

  const payees = new Map<string, { side: Side; payee: string; cents: number[] }>();
  for (const { tx, account } of located) {
    const payee = payeeOf(tx);
    const key = `${account.side}:${payee}`;
    const entry = payees.get(key) ?? { side: account.side, payee, cents: [] };
    entry.cents.push(tx.amountCents);
    payees.set(key, entry);
  }
  const byPayee = [...payees.values()]
    .map((p) => ({ payee: p.payee, side: p.side, count: p.cents.length, total: figure(sumCents(p.cents), cite([spanLabel, p.payee, label(ctx.locale, p.side)])) }))
    .sort((x, y) => Math.abs(Number(y.total.amount)) - Math.abs(Number(x.total.amount)))
    .slice(0, MAX_GROUPS);

  const transactions = located.slice(0, MAX_TRANSACTIONS).map(({ tx, month, account }) => ({
    date: tx.date,
    payee: payeeOf(tx),
    description: tx.name ? tx.description : null,
    account: account.lineName,
    side: account.side,
    type: tx.type,
    ...figure(tx.amountCents, cite([tx.date, account.lineName, payeeOf(tx)], { report: month.report, lineId: account.lineId, href: account.href })),
  }));

  return {
    ...base,
    paid: Object.fromEntries(sides).paid,
    received: Object.fromEntries(sides).received,
    byAccount,
    byPayee,
    transactions,
    moreTransactions: Math.max(0, located.length - transactions.length),
    note: 'paid = cost and expense accounts, received = income accounts; each amount keeps its account\'s own direction, so a refund or an adjustment that reduces an account is negative.',
  };
}

export async function searchTransactions(ctx: ToolContext, input: ToolInput<'search_transactions'>): Promise<ToolResult> {
  const query = input.query.trim();
  if (query.length < 2) return { available: false, reason: 'query_too_short' };

  const { data: ledgers } = await ctx.supabase
    .from('general_ledgers')
    .select('period_start, period_end')
    .eq('business_entity_id', ctx.entityId)
    .eq('status', 'published')
    .order('period_end', { ascending: false });
  const published = ledgers ?? [];
  const availableMonths = published.map((l) => periodText(l.period_start, l.period_end, ctx.locale));
  if (published.length === 0) return { available: false, reason: 'no_published_ledger' };

  const wanted = parsePeriodInput(input.period);
  if (input.period !== null && !wanted) return { available: false, reason: 'invalid_period', availableMonths };
  const range = wanted ?? ctx.context.period;
  let inRange = range ? published.filter((l) => l.period_start >= range.start && l.period_end <= range.end) : [];
  // The page's period without a ledger is not what the user asked about: the newest month is.
  if (inRange.length === 0 && !wanted) inRange = published.slice(0, 1);
  if (inRange.length === 0) return { available: false, reason: 'no_ledger_for_period', availableMonths };

  const reports = (await loadPublishedReports(ctx.supabase, ctx.entityId)).filter((r) => r.reportType === 'profit_and_loss');
  const months: LedgerMonth[] = [];
  for (const ledger of inRange.slice(0, MAX_MONTHS)) {
    const report = reports.find((r) => r.periodStart === ledger.period_start && r.periodEnd === ledger.period_end);
    if (!report) continue;
    const roots = buildTree(await loadReportLines(ctx.supabase, ctx.entityId, report.id));
    // Matched against the statement the client sees, exactly as the portal links it.
    const detail = await loadLedgerDetail(ctx.supabase, ctx.entityId, report, roots);
    if (!detail) continue;
    const links = ledgerLinks(roots, detail);
    const expenseIds = new Set(pnlExpenseLines(roots).map((l) => l.id));
    const names = new Map(flattenTree(roots).map((n) => [n.id, n.accountName]));
    const accounts = new Map<string, MonthAccount>();
    for (const line of detail.lines.values()) {
      accounts.set(line.accountId, {
        lineId: line.lineId,
        lineName: names.get(line.lineId) ?? '',
        side: expenseIds.has(line.lineId) ? 'paid' : 'received',
        href: links[line.lineId]?.href ?? null,
      });
    }
    months.push({ report, accounts });
  }
  if (months.length === 0) return { available: false, reason: 'no_ledger_for_period', availableMonths };

  const txns = await searchLedgerTransactions(
    ctx.supabase,
    ctx.entityId,
    months.flatMap((m) => [...m.accounts.keys()]),
    query,
  );
  return {
    ...transactionSearchOut(ctx, query, months, txns),
    ...(inRange.length > MAX_MONTHS ? { truncatedToMonths: MAX_MONTHS } : {}),
  };
}
