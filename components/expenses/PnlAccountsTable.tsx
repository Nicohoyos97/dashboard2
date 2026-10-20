// The expense accounts of a Profit & Loss as a plain table — what Expenses
// shows when no General Ledger stands behind the period, so no account opens.
import { getTranslations } from 'next-intl/server';

import { formatCents } from '@/lib/money';
import { type PnlExpenseKind, type PnlExpenseLine, shareOf } from '@/lib/reports/pnl-expenses';

export async function PnlAccountsTable({
  lines,
  totals,
  kindLabel,
  currency,
}: {
  lines: PnlExpenseLine[];
  /** Each kind's printed total, the share's denominator. */
  totals: Record<PnlExpenseKind, number | null>;
  kindLabel: Record<PnlExpenseKind, string>;
  currency: string;
}) {
  const [t, tStatements] = await Promise.all([getTranslations('Expenses'), getTranslations('Statements')]);
  const money = (cents: number) => formatCents(cents, currency);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-ui">
        <thead className="text-muted-foreground border-line border-b text-caption font-semibold tracking-[0.06em] uppercase">
          <tr>
            <th scope="col" className="px-3 py-2">{tStatements('colAccount')}</th>
            <th scope="col" className="hidden px-3 py-2 sm:table-cell">{t('pnlColType')}</th>
            <th scope="col" className="px-3 py-2 text-right">{t('pnlColAmount')}</th>
            <th scope="col" className="px-3 py-2 text-right">{t('pnlColShare')}</th>
          </tr>
        </thead>
        <tbody className="divide-line divide-y">
          {lines.map((l) => {
            const share = shareOf(l.cents, totals[l.kind]);
            return (
              <tr key={l.id}>
                <th scope="row" className="px-3 py-2.5 font-normal">
                  <span className="text-ink font-medium">{l.label}</span>
                  {l.group && <span className="text-muted-foreground block text-caption">{l.group}</span>}
                  {/* On a phone the type rides under the name, so the amount and its share fit without scrolling. */}
                  <span className="text-muted-foreground block text-caption sm:hidden">{kindLabel[l.kind]}</span>
                </th>
                <td className="text-muted-foreground hidden px-3 py-2.5 sm:table-cell">{kindLabel[l.kind]}</td>
                <td className="text-ink px-3 py-2.5 text-right whitespace-nowrap tabular-nums">{money(l.cents)}</td>
                <td className="text-muted-foreground px-3 py-2.5 text-right whitespace-nowrap tabular-nums">
                  {share === null ? '—' : `${share.toFixed(1)}%`}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="text-muted-foreground mt-3 text-small">{t('pnlShareNote')}</p>
    </div>
  );
}
