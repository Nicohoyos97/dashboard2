'use client';

import { CheckCircle2, ChevronRight, Download } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

import type { LedgerTxn } from '@/lib/ledger/display';
import { formatCents } from '@/lib/money';

import { PayeeList } from './PayeeList';
import { TransactionList } from './TransactionList';

export type LedgerAccountRow = {
  id: string;
  label: string;
  group: string | null;
  kindLabel: string;
  cents: number;
  share: number | null;
  /** How many transactions the published ledger has behind the account; null when the month has none for it. */
  count: number | null;
  /** The transactions, when they came with the page (the account the client arrived for); any other is fetched when opened. */
  txns: LedgerTxn[] | null;
};

type Fetched = LedgerTxn[] | 'loading' | 'failed';

async function fetchTransactions(lineId: string): Promise<LedgerTxn[]> {
  const response = await fetch(`/api/ledger/lines/${lineId}`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`ledger_line_${response.status}`);
  const body = (await response.json()) as { txns?: unknown };
  if (!Array.isArray(body.txns)) throw new Error('ledger_line_shape');
  return body.txns as LedgerTxn[];
}

// The Expenses page's account table when the month has a General Ledger: each
// account opens in place onto the transactions behind it, by payee or one by
// one. `openId` is the account the client clicked on the P&L or the Overview,
// opened and scrolled to on arrival; its transactions come with the page, and
// any other account's are fetched the first time it is opened.
export function LedgerAccountsTable({ rows, currency, openId }: { rows: LedgerAccountRow[]; currency: string; openId: string | null }) {
  const t = useTranslations('Ledger');
  const tExpenses = useTranslations('Expenses');
  const tStatements = useTranslations('Statements');
  const [open, setOpen] = useState<Set<string>>(() => new Set(openId ? [openId] : []));
  const [view, setView] = useState<Record<string, 'payee' | 'all'>>({});
  const [fetched, setFetched] = useState<Record<string, Fetched>>({});
  const requested = useRef(new Set<string>());

  // Not only on arrival: a link to this same page with another `?line=` (a Nick
  // citation, say) changes `openId` without remounting the table, and that
  // account has to open and come into view as well.
  useEffect(() => {
    if (!openId) return;
    setOpen((prev) => (prev.has(openId) ? prev : new Set(prev).add(openId)));
    document.getElementById(`line-${openId}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, [openId]);

  // An open account whose transactions did not come with the page is fetched
  // once; a failure stays shown until the page is reloaded.
  useEffect(() => {
    for (const row of rows) {
      if (!open.has(row.id) || row.count === null || row.txns !== null || requested.current.has(row.id)) continue;
      requested.current.add(row.id);
      setFetched((prev) => ({ ...prev, [row.id]: 'loading' }));
      fetchTransactions(row.id)
        .then((txns) => setFetched((prev) => ({ ...prev, [row.id]: txns })))
        .catch(() => setFetched((prev) => ({ ...prev, [row.id]: 'failed' })));
    }
  }, [open, rows]);

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const tab = (active: boolean) =>
    `h-9 rounded-lg px-3 text-small font-semibold transition ${active ? 'bg-card text-ink shadow-card' : 'text-muted-foreground hover:text-ink'}`;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-ui">
        <thead className="text-muted-foreground border-line border-b text-caption font-semibold tracking-[0.06em] uppercase">
          <tr>
            <th scope="col" className="px-3 py-2">{tStatements('colAccount')}</th>
            <th scope="col" className="hidden px-3 py-2 sm:table-cell">{tExpenses('pnlColType')}</th>
            <th scope="col" className="px-3 py-2 text-right">{tExpenses('pnlColAmount')}</th>
            <th scope="col" className="px-3 py-2 text-right">{tExpenses('pnlColShare')}</th>
          </tr>
        </thead>
        <tbody className="divide-line divide-y">
          {rows.flatMap((row) => {
            const isOpen = open.has(row.id) && row.count !== null;
            const state = fetched[row.id];
            const txns = row.txns ?? (Array.isArray(state) ? state : null);
            const mode = view[row.id] ?? 'payee';
            const name = (
              <>
                <span className="text-ink font-medium">{row.label}</span>
                {row.group && <span className="text-muted-foreground block text-caption">{row.group}</span>}
                <span className="text-muted-foreground block text-caption sm:hidden">{row.kindLabel}</span>
              </>
            );
            const main = (
              <tr key={row.id} id={`line-${row.id}`} className={`scroll-mt-24 ${isOpen ? 'bg-blue-pale/40' : ''}`}>
                <th scope="row" className="px-3 py-2.5 font-normal">
                  {row.count !== null ? (
                    <button
                      type="button"
                      onClick={() => toggle(row.id)}
                      aria-expanded={isOpen}
                      aria-label={t('openAccount', { account: row.label })}
                      className="flex w-full items-start gap-2 text-left"
                    >
                      <ChevronRight className={`text-muted-foreground mt-0.5 size-4 shrink-0 transition ${isOpen ? 'rotate-90' : ''}`} aria-hidden="true" />
                      <span>
                        {name}
                        <span className="text-link block text-caption font-semibold">{t('transactions', { count: row.count })}</span>
                      </span>
                    </button>
                  ) : (
                    <span className="block pl-6">{name}</span>
                  )}
                </th>
                <td className="text-muted-foreground hidden px-3 py-2.5 sm:table-cell">{row.kindLabel}</td>
                <td className="text-ink px-3 py-2.5 text-right whitespace-nowrap tabular-nums">{formatCents(row.cents, currency)}</td>
                <td className="text-muted-foreground px-3 py-2.5 text-right whitespace-nowrap tabular-nums">
                  {row.share === null ? '—' : `${row.share.toFixed(1)}%`}
                </td>
              </tr>
            );
            if (!isOpen) return [main];
            if (!txns) {
              return [
                main,
                <tr key={`${row.id}-detail`} className="bg-blue-pale/40">
                  <td colSpan={4} className="px-3 pb-4 sm:pl-9">
                    <p role="status" className="border-line bg-card text-muted-foreground rounded-xl border px-4 py-3 text-small">
                      {state === 'failed' ? t('notAvailable') : t('loading')}
                    </p>
                  </td>
                </tr>,
              ];
            }
            return [
              main,
              <tr key={`${row.id}-detail`} className="bg-blue-pale/40">
                <td colSpan={4} className="px-3 pb-4 sm:pl-9">
                  <div className="border-line bg-card overflow-hidden rounded-xl border">
                    <div className="border-line flex flex-wrap items-center justify-between gap-3 border-b px-4 py-2.5">
                      <span className="text-ink text-ui font-semibold">{row.label}</span>
                      <div role="group" aria-label={t('viewBy')} className="bg-secondary inline-flex rounded-xl p-1">
                        <button type="button" aria-pressed={mode === 'payee'} onClick={() => setView((v) => ({ ...v, [row.id]: 'payee' }))} className={tab(mode === 'payee')}>
                          {t('byPayee')}
                        </button>
                        <button type="button" aria-pressed={mode === 'all'} onClick={() => setView((v) => ({ ...v, [row.id]: 'all' }))} className={tab(mode === 'all')}>
                          {t('allTransactions')}
                        </button>
                      </div>
                    </div>
                    {mode === 'payee' ? (
                      <PayeeList txns={txns} currency={currency} />
                    ) : (
                      <div className="p-3">
                        <TransactionList txns={txns} currency={currency} searchable={txns.length > 8} />
                      </div>
                    )}
                    <div className="bg-paper border-line flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t px-4 py-2.5 text-small">
                      <p className="text-muted-foreground flex items-center gap-2">
                        <CheckCircle2 className="text-success size-4 shrink-0" aria-hidden="true" />
                        {t('addsUp', { count: txns.length, total: formatCents(row.cents, currency) })}
                      </p>
                      <a href={`/api/ledger/lines/${row.id}/csv`} download className="text-link inline-flex items-center gap-1.5 font-semibold hover:underline">
                        <Download className="size-4" aria-hidden="true" />
                        {t('downloadCsv')}
                      </a>
                    </div>
                  </div>
                </td>
              </tr>,
            ];
          })}
        </tbody>
      </table>
    </div>
  );
}
