'use client';

import { Search } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';

import { inputClass } from '@/components/admin/ui';
import { type LedgerTxn, isAdjustment, knownType, txnTitle } from '@/lib/ledger/display';
import { formatCents } from '@/lib/money';
import { formatIsoDate } from '@/lib/utils/dates';

const PAGE = 25;
const DAY: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };

/** The words a row shows — and so the words a search has to find. */
function useTxnText() {
  const t = useTranslations('Ledger');
  return useMemo(
    () => ({
      heading: (tx: LedgerTxn) =>
        txnTitle(tx).title ??
        (isAdjustment(tx) ? (tx.num ? t('adjustmentNum', { num: tx.num }) : t('adjustment')) : t('untitled')),
      typeLabel: (type: string | null) => {
        const kind = knownType(type);
        return kind ? t(`type_${kind}`) : type;
      },
    }),
    [t],
  );
}

/** One transaction as the client reads it: when, with whom, what kind, how much. */
export function TransactionRow({ tx, currency }: { tx: LedgerTxn; currency: string }) {
  const locale = useLocale();
  const text = useTxnText();
  const { detail } = txnTitle(tx);
  const adjustment = isAdjustment(tx);
  const heading = text.heading(tx);
  const typeLabel = text.typeLabel(tx.type);
  const negative = tx.amountCents < 0;
  return (
    <li className="grid grid-cols-[52px_minmax(0,1fr)_auto] items-center gap-3 px-4 py-2.5">
      <span className="text-muted-foreground text-[13px] tabular-nums">{formatIsoDate(tx.date, locale, DAY)}</span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-ink truncate text-[14px] font-semibold">{heading}</span>
        <span className="text-muted-foreground flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[12.5px]">
          {typeLabel && (
            <span className={`rounded-full px-2 py-px text-[11.5px] font-semibold ${adjustment ? 'bg-warning/10 text-warning' : 'bg-secondary text-ink/80'}`}>
              {typeLabel}
            </span>
          )}
          {detail && <span className="break-all">{detail}</span>}
          {tx.split && <span>· {tx.split}</span>}
        </span>
      </span>
      <span className={`text-right text-[14px] tabular-nums ${negative ? 'text-danger' : 'text-ink'}`}>
        {negative ? '−' : ''}
        {formatCents(Math.abs(tx.amountCents), currency)}
      </span>
    </li>
  );
}

// Every transaction of one account: a search, a filter per transaction type
// (only the types present), and the list in pages of 25 so a month of daily
// deposits stays readable.
export function TransactionList({ txns, currency, searchable = true }: { txns: readonly LedgerTxn[]; currency: string; searchable?: boolean }) {
  const t = useTranslations('Ledger');
  const text = useTxnText();
  const [query, setQuery] = useState('');
  const [type, setType] = useState<string | null>(null);
  const [limit, setLimit] = useState(PAGE);

  const types = useMemo(() => {
    const counts = new Map<string, number>();
    for (const tx of txns) counts.set(tx.type ?? '', (counts.get(tx.type ?? '') ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [txns]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return txns.filter((tx) => {
      if (type !== null && (tx.type ?? '') !== type) return false;
      if (!needle) return true;
      const amount = (Math.abs(tx.amountCents) / 100).toFixed(2);
      return [text.heading(tx), text.typeLabel(tx.type), tx.description, tx.split, tx.num, amount].some((v) => v?.toLowerCase().includes(needle));
    });
  }, [txns, query, type, text]);
  const shown = filtered.slice(0, limit);

  const chip = (active: boolean) =>
    `h-9 rounded-full border px-3.5 text-[13px] font-semibold transition ${active ? 'border-blue bg-blue text-white' : 'border-line bg-card text-ink hover:bg-secondary'}`;

  return (
    <div className="flex flex-col gap-3">
      {searchable && (
        <>
          <label className="relative block">
            <span className="sr-only">{t('searchLabel')}</span>
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setLimit(PAGE);
              }}
              placeholder={t('search')}
              className={`${inputClass} h-11 pl-9`}
            />
          </label>
          {types.length > 1 && (
            <div role="group" aria-label={t('filterGroup')} className="flex flex-wrap gap-2">
              <button type="button" aria-pressed={type === null} onClick={() => setType(null)} className={chip(type === null)}>
                {t('filterAll')} · {txns.length}
              </button>
              {types.map(([value, count]) => (
                <button key={value} type="button" aria-pressed={type === value} onClick={() => { setType(value); setLimit(PAGE); }} className={chip(type === value)}>
                  {text.typeLabel(value || null) ?? t('untitled')} · {count}
                </button>
              ))}
            </div>
          )}
        </>
      )}

      <div className="border-line bg-card overflow-hidden rounded-xl border">
        {shown.length === 0 ? (
          <p className="text-muted-foreground px-4 py-5 text-[13.5px]">{t('noMatches')}</p>
        ) : (
          <ul className="divide-line divide-y">
            {shown.map((tx) => (
              <TransactionRow key={tx.id} tx={tx} currency={currency} />
            ))}
          </ul>
        )}
        {filtered.length > PAGE && (
          <div className="bg-paper border-line flex flex-wrap items-center justify-between gap-3 border-t px-4 py-2.5">
            <span className="text-muted-foreground text-[13px]">{t('showing', { shown: shown.length, total: filtered.length })}</span>
            {shown.length < filtered.length && (
              <button
                type="button"
                onClick={() => setLimit((n) => n + PAGE)}
                className="border-line bg-card text-ink hover:bg-secondary h-9 rounded-lg border px-3.5 text-[13px] font-semibold"
              >
                {t('showMore', { count: Math.min(PAGE, filtered.length - shown.length) })}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
