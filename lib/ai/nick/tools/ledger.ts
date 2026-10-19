// "How much did I pay Meta?" — Nick reads the transactions behind the P&L
// accounts, from the General Ledgers the firm published (0026). Every total,
// count and split is computed here; the model only quotes them, each with its
// citation. Money paid (cost of goods sold, expenses and other expenses) and
// money received (income and other income) are never added together: a vendor
// that is also a customer gets two figures, not one meaningless net. Which side
// a line is on comes from the P&L section it sits in; a line under a heading
// that names neither is left out rather than guessed.
import { citationLabel } from '@/lib/ai/nick/citations';
import { type LedgerTxn, isAdjustment, txnTitle } from '@/lib/ledger/display';
import { ledgerLinks } from '@/lib/ledger/links';
import { loadLedgerDetail, loadPublishedLedgers, searchLedgerTransactions } from '@/lib/ledger/load';
import { fromCents, sumCents } from '@/lib/money';
import { loadPublishedReports, loadReportLines } from '@/lib/portal/load';
import { PNL_SYNONYMS } from '@/lib/reports/pnl';
import { findSection } from '@/lib/reports/sections';
import { buildTree, flattenTree } from '@/lib/reports/tree';
import type { LineNode, ReportRow } from '@/lib/reports/types';

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

/** Section headings a QuickBooks P&L prints, after normalizeName, by the side their accounts' money moves. */
const SIDE_SECTIONS: Record<Side, readonly string[]> = {
  received: [...PNL_SYNONYMS.revenue, 'other income', 'other revenue'],
  paid: [...PNL_SYNONYMS.cogs, ...PNL_SYNONYMS.operatingExpenses, 'other expenses', 'other expense'],
};

/** Every line of the P&L under a heading whose side is known, by line id. */
export function lineSides(roots: readonly LineNode[]): Map<string, Side> {
  const sides = new Map<string, Side>();
  const mark = (node: LineNode, side: Side) => {
    sides.set(node.id, side);
    for (const child of node.children) mark(child, side);
  };
  for (const side of ['received', 'paid'] as const) {
    for (const heading of SIDE_SECTIONS[side]) {
      const section = findSection(roots, [heading]);
      if (section) mark(section, side);
    }
  }
  return sides;
}

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
    note: 'paid = cost of goods sold, expense and other expense accounts; received = income and other income accounts; each amount keeps its account\'s own direction, so a refund or an adjustment that reduces an account is negative.',
  };
}

export async function searchTransactions(ctx: ToolContext, input: ToolInput<'search_transactions'>): Promise<ToolResult> {
  const query = input.query.trim();
  if (query.length < 2) return { available: false, reason: 'query_too_short' };

  const published = await loadPublishedLedgers(ctx.supabase, ctx.entityId);
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
  // Months are independent reads, so a year is one wave of round trips rather than twelve.
  const loaded = await Promise.all(
    inRange.slice(0, MAX_MONTHS).map(async (ledger) => {
      const report = reports.find((r) => r.periodStart === ledger.period_start && r.periodEnd === ledger.period_end);
      if (!report) return null;
      const roots = buildTree(await loadReportLines(ctx.supabase, ctx.entityId, report.id));
      // Matched against the statement the client sees, exactly as the portal links it.
      const detail = await loadLedgerDetail(ctx.supabase, ctx.entityId, report, roots, published);
      if (!detail) return null;
      const links = ledgerLinks(roots, detail);
      const sides = lineSides(roots);
      const names = new Map(flattenTree(roots).map((n) => [n.id, n.accountName]));
      const accounts = new Map<string, MonthAccount>();
      for (const line of detail.lines.values()) {
        const side = sides.get(line.lineId);
        if (!side) continue;
        const account = { lineId: line.lineId, lineName: names.get(line.lineId) ?? '', side, href: links[line.lineId]?.href ?? null };
        for (const id of line.accountIds) accounts.set(id, account);
      }
      return { ledgerId: detail.ledgerId, month: { report, accounts } satisfies LedgerMonth };
    }),
  );
  const found = loaded.flatMap((entry) => (entry ? [entry] : []));
  const months = found.map((entry) => entry.month);
  if (months.length === 0) return { available: false, reason: 'no_ledger_for_period', availableMonths };

  const { txns, truncated } = await searchLedgerTransactions(
    ctx.supabase,
    ctx.entityId,
    found.map((entry) => entry.ledgerId),
    new Set(months.flatMap((m) => [...m.accounts.keys()])),
    query,
  );
  return {
    ...transactionSearchOut(ctx, query, months, txns),
    ...(inRange.length > MAX_MONTHS ? { truncatedToMonths: MAX_MONTHS } : {}),
    // Totals over a partial set would read as complete: say so, so the answer can.
    ...(truncated
      ? { partial: true, partialNote: 'More transactions matched than one search reads, so these totals cover only part of them. Say so, and suggest a shorter period.' }
      : {}),
  };
}
