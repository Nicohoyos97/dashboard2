import { useTranslations } from 'next-intl';

import { type LedgerTxn, groupByPayee, isAdjustment } from '@/lib/ledger/display';
import { formatCents } from '@/lib/money';

// One account's transactions gathered by who they were with, largest first,
// each bar its share of the account. The share is arithmetic on the
// transactions shown, never a figure the statement prints.
export function PayeeList({ txns, currency }: { txns: readonly LedgerTxn[]; currency: string }) {
  const t = useTranslations('Ledger');
  // An adjustment carries no payee: it groups as what it is.
  const groups = groupByPayee(txns, (tx) => (isAdjustment(tx) ? t('adjustment') : t('untitled')));
  const scale = groups.reduce((sum, g) => sum + Math.abs(g.totalCents), 0);

  return (
    <ul className="divide-line divide-y">
      {groups.map((group) => {
        const pct = scale === 0 ? 0 : Math.round((Math.abs(group.totalCents) / scale) * 1000) / 10;
        const negative = group.totalCents < 0;
        return (
          <li key={group.label} className="grid grid-cols-[minmax(0,14rem)_minmax(0,1fr)_auto] items-center gap-3 px-4 py-2.5 max-sm:grid-cols-[minmax(0,1fr)_auto]">
            <span className="flex min-w-0 flex-col">
              <span className="text-ink truncate text-[14px] font-semibold">{group.label}</span>
              <span className="text-muted-foreground text-[12.5px]">{t('transactions', { count: group.count })}</span>
            </span>
            <span className="bg-secondary h-2 overflow-hidden rounded-full max-sm:hidden" role="presentation">
              <span className="bg-blue/60 block h-full rounded-full" style={{ width: `${pct}%` }} />
            </span>
            <span className={`text-right text-[14px] tabular-nums ${negative ? 'text-danger' : 'text-ink'}`}>
              {negative ? '−' : ''}
              {formatCents(Math.abs(group.totalCents), currency)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
