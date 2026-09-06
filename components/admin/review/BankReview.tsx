import { getLocale, getTranslations } from 'next-intl/server';

import type { Reconciliation } from '@/lib/documents/reconciliation';
import { formatIsoDate, formatPeriod } from '@/lib/utils/dates';
import { formatAmount } from '@/lib/money';

export type BankStatementSummary = {
  id: string;
  institution: string;
  maskedNumber: string;
  periodStart: string;
  periodEnd: string;
  beginningBalance: number | null;
  endingBalance: number | null;
  status: string;
  reconciliation: Reconciliation | null;
  currency: string;
};

export type TransactionRow = {
  id: string;
  date: string;
  description: string;
  debit: number | null;
  credit: number | null;
  runningBalance: number | null;
  pageNumber: number | null;
  confidence: number | null;
};

const PREVIEW = 60;

// Read-only view of an extracted bank statement (transactions are corrected
// through the transactions module in Phase 5; here the firm verifies totals).
export async function BankReview({
  statement,
  transactions,
}: {
  statement: BankStatementSummary;
  transactions: TransactionRow[];
}) {
  const [t, locale] = await Promise.all([getTranslations('Admin'), getLocale()]);
  const fmt = (v: number | null) =>
    v === null ? '' : formatAmount(v, statement.currency);
  const rec = statement.reconciliation;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3 text-[13.5px]">
        <span className={`rounded-full px-2.5 py-1 font-semibold ${rec?.passed ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'}`}>
          {rec?.passed ? t('reconciliationPassed') : t('reconciliationFailed')}
        </span>
        <span className="text-muted-foreground">
          {statement.institution} · {statement.maskedNumber} · {formatPeriod(statement.periodStart, statement.periodEnd, locale)}
        </span>
        <span className="text-muted-foreground">
          {fmt(statement.beginningBalance)} → {fmt(statement.endingBalance)}
        </span>
      </div>
      {rec && rec.checks.length > 0 && (
        <ul className="border-line divide-line divide-y rounded-xl border text-[13.5px]">
          {rec.checks.map((c) => (
            <li key={c.key} className="flex items-center gap-3 px-4 py-2.5">
              <span className={`size-2.5 shrink-0 rounded-full ${c.ok ? 'bg-success' : 'bg-danger'}`} aria-hidden="true" />
              <span className="text-ink flex-1 font-medium">{c.label}</span>
              <span className="text-muted-foreground">
                {c.ok ? 'OK' : `${t('expected')} ${fmt((c.expectedCents ?? 0) / 100)} · ${t('actual')} ${fmt((c.actualCents ?? 0) / 100)}`}
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[13.5px]">
          <thead className="text-muted-foreground border-line border-b text-[12px] font-semibold tracking-[0.06em] uppercase">
            <tr>
              <th className="px-3 py-2">{t('colDate')}</th>
              <th className="px-3 py-2">{t('colDescription')}</th>
              <th className="px-3 py-2 text-right">{t('colDebit')}</th>
              <th className="px-3 py-2 text-right">{t('colCredit')}</th>
              <th className="px-3 py-2 text-right">{t('colBalance')}</th>
              <th className="px-3 py-2 text-right">{t('colPage')}</th>
            </tr>
          </thead>
          <tbody className="divide-line divide-y">
            {transactions.slice(0, PREVIEW).map((tx) => (
              <tr key={tx.id}>
                <td className="px-3 py-2 whitespace-nowrap">{formatIsoDate(tx.date, locale)}</td>
                <td className="text-ink px-3 py-2">{tx.description}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmt(tx.debit)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmt(tx.credit)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmt(tx.runningBalance)}</td>
                <td className="text-muted-foreground px-3 py-2 text-right">{tx.pageNumber ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {transactions.length > PREVIEW && (
          <p className="text-muted-foreground px-3 py-2 text-[13px]">{t('moreRows', { count: transactions.length - PREVIEW })}</p>
        )}
      </div>
    </div>
  );
}
