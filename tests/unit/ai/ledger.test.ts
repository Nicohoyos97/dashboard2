// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { CitationRegistry } from '@/lib/ai/nick/citations';
import { type LedgerMonth, transactionSearchOut } from '@/lib/ai/nick/tools/ledger';
import type { LedgerTxn } from '@/lib/ledger/display';

import { report } from '../reports/fixtures';

const shape = (locale: 'en' | 'es' = 'en') => ({ locale, currency: 'USD', registry: new CitationRegistry() });

const SEPT = report({ id: 'pnl-sep', periodStart: '2026-09-01', periodEnd: '2026-09-30' });
const AUG = report({ id: 'pnl-aug', periodStart: '2026-08-01', periodEnd: '2026-08-31' });

function month(r: typeof SEPT, prefix: string): LedgerMonth {
  return {
    report: r,
    accounts: new Map([
      [`${prefix}-marketing`, { lineId: `${prefix}-L-mkt`, lineName: 'Marketing', side: 'paid' as const, href: `/expenses?line=${prefix}-L-mkt` }],
      [`${prefix}-catering`, { lineId: `${prefix}-L-cat`, lineName: 'Catering', side: 'received' as const, href: `/statements/profit-and-loss/lines/${prefix}-L-cat` }],
    ]),
  };
}

const tx = (accountId: string, date: string, cents: number, over: Partial<LedgerTxn> = {}): LedgerTxn => ({
  id: `${accountId}-${date}-${cents}`, accountId, date, type: 'Credit Card Expense', num: null,
  name: 'Meta Platforms', description: 'Instagram ads', split: 'Amex ••1007', amountCents: cents, ...over,
});

describe('search_transactions shaping', () => {
  it('totals what was paid and what was received apart, each with its own citation', () => {
    const ctx = shape();
    const out = transactionSearchOut(ctx, 'meta', [month(SEPT, 's')], [
      tx('s-marketing', '2026-09-28', 20_309),
      tx('s-marketing', '2026-09-19', 30_000),
      tx('s-marketing', '2026-09-12', -5_000, { type: 'Credit Card Credit', description: 'Refund' }),
      tx('s-catering', '2026-09-06', 100_000, { type: 'Deposit', name: 'Meta Platforms', description: 'Office lunch' }),
    ]);
    expect(out).toMatchObject({
      available: true,
      matches: 4,
      paid: { count: 3, total: { amount: '453.09', formatted: '$453.09' } },
      received: { count: 1, total: { amount: '1000.00', formatted: '$1,000.00' } },
    });
    // No figure anywhere adds the two sides together.
    expect(JSON.stringify(out)).not.toContain('1453.09');
    const paid = (out.paid as { total: { cite: string } }).total.cite;
    expect(ctx.registry.get(paid)).toMatchObject({ reportId: 'pnl-sep', lineId: null, periodStart: '2026-09-01', documentVersionId: null });
  });

  it('splits by account and by payee, largest first, and cites each transaction to its P&L line', () => {
    const ctx = shape();
    const out = transactionSearchOut(ctx, 'meta', [month(SEPT, 's')], [
      tx('s-marketing', '2026-09-28', 20_309),
      tx('s-marketing', '2026-09-05', 30_000, { name: null, description: 'META ADS 8812' }),
    ]) as {
      byAccount: { account: string; total: { amount: string; cite: string } }[];
      byPayee: { payee: string; count: number }[];
      transactions: { payee: string; cite: string }[];
    };
    expect(out.byAccount).toHaveLength(1);
    expect(out.byAccount[0]).toMatchObject({ account: 'Marketing', total: { amount: '503.09' } });
    expect(ctx.registry.get(out.byAccount[0]?.total.cite ?? '')).toMatchObject({ lineId: 's-L-mkt', href: '/expenses?line=s-L-mkt' });
    // Nameless lines are titled by the bank description, as printed.
    expect(out.byPayee.map((p) => p.payee)).toEqual(['META ADS 8812', 'Meta Platforms']);
    expect(ctx.registry.get(out.transactions[0]?.cite ?? '')).toMatchObject({ reportId: 'pnl-sep', lineId: 's-L-mkt' });
  });

  it('adds up several months under one period, and says plainly when nothing matches', () => {
    const ctx = shape('es');
    const out = transactionSearchOut(ctx, 'meta', [month(SEPT, 's'), month(AUG, 'a')], [
      tx('s-marketing', '2026-09-28', 20_309),
      tx('a-marketing', '2026-08-20', 30_000),
    ]) as { period: { start: string; end: string }; paid: { total: { amount: string; cite: string } }; byAccount: unknown[] };
    expect(out.period).toMatchObject({ start: '2026-08-01', end: '2026-09-30' });
    expect(out.paid.total.amount).toBe('503.09');
    // One account across months is one row.
    expect(out.byAccount).toHaveLength(1);
    // A total spanning months points at no single statement.
    expect(ctx.registry.get(out.paid.total.cite)).toMatchObject({ reportId: null, periodStart: '2026-08-01', periodEnd: '2026-09-30' });
    expect(ctx.registry.get(out.paid.total.cite)?.label).toContain('Transacciones');

    expect(transactionSearchOut(shape(), 'zzz', [month(SEPT, 's')], [])).toMatchObject({ available: true, matches: 0, reason: 'no_matching_transactions' });
  });
});
