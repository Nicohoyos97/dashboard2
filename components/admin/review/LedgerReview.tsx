import { CheckCircle2, CircleAlert } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';

import { card } from '@/components/admin/ui';
import { parseReconciliation } from '@/lib/documents/reconciliation';
import { reviewLedger } from '@/lib/ledger/review';
import { formatCents } from '@/lib/money';
import { createClient } from '@/lib/supabase/server';
import { formatPeriod } from '@/lib/utils/dates';

// A General Ledger as the firm reviews it before publishing (0026): does the
// file add up, does it sit beside this month's published P&L on the same
// basis, and does every P&L line find its account at exactly the same figure.
// The same reviewLedger() decides the Publish button, so this page and the
// button cannot disagree. Loads its own rows: the document page is long enough.
export async function LedgerReview({ versionId, currency }: { versionId: string; currency: string }) {
  const supabase = await createClient();
  const [t, locale, { data: ledgers }] = await Promise.all([
    getTranslations('Admin'),
    getLocale(),
    supabase
      .from('general_ledgers')
      .select('id, business_entity_id, period_start, period_end, basis, company_name, status, reconciliation, ledger_accounts ( transaction_count )')
      .eq('document_version_id', versionId),
  ]);
  if (!ledgers || ledgers.length === 0) return <p className="text-muted-foreground mt-6 text-[14px]">{t('noExtraction')}</p>;
  const money = (cents: number) => formatCents(cents, currency);

  return (
    <>
      {await Promise.all(
        ledgers.map(async (ledger) => {
          const review = await reviewLedger(supabase, ledger);
          const rec = parseReconciliation(ledger.reconciliation);
          const failingAccounts = (rec?.checks ?? []).filter((c) => !c.ok && c.key.startsWith('account:'));
          const outside = (rec?.checks ?? []).find((c) => c.key === 'dates_in_period' && !c.ok);
          const transactions = ledger.ledger_accounts.reduce((sum, a) => sum + a.transaction_count, 0);
          const basis = ledger.basis === 'cash' ? t('basisCash') : ledger.basis === 'accrual' ? t('basisAccrual') : t('ledgerNoBasis');
          const lines = review.match?.lines ?? [];
          const off = lines.filter((l) => l.status !== 'matched');

          const checks = [
            {
              ok: rec?.passed === true,
              title: t('ledgerCheckArithmetic'),
              body: rec?.passed
                ? t('ledgerCheckArithmeticOk', { count: ledger.ledger_accounts.length })
                : outside
                  ? t('ledgerOutsidePeriod', { count: outside.actualCents })
                  : t('ledgerCheckArithmeticOff', { count: failingAccounts.length }),
            },
            {
              ok: review.statement !== null && review.blocker !== 'publishBlockedLedgerBasis',
              title: t('ledgerCheckStatement'),
              body:
                review.blocker === 'publishBlockedLedgerNoStatement'
                  ? t('publishBlockedLedgerNoStatement')
                  : review.blocker === 'publishBlockedLedgerBasis'
                    ? t('publishBlockedLedgerBasis')
                    : t('ledgerCheckStatementOk', { period: formatPeriod(ledger.period_start, ledger.period_end, locale), basis }),
            },
            {
              ok: review.match?.passed === true,
              title: t('ledgerCheckLines'),
              body: review.match
                ? off.length === 0
                  ? t('ledgerCheckLinesOk', { count: lines.length })
                  : t('ledgerCheckLinesOff', { count: off.length })
                : t('ledgerCheckLinesWaiting'),
            },
          ];

          return (
            <section key={ledger.id} className={`${card} mt-6`}>
              <h2 className="text-ink text-[17px] font-semibold">{t('ledgerTitle')}</h2>
              <p className="text-muted-foreground mt-1 text-[13.5px]">
                {formatPeriod(ledger.period_start, ledger.period_end, locale)} · {basis} ·{' '}
                {t('ledgerSize', { accounts: ledger.ledger_accounts.length, transactions })}
                {ledger.company_name ? ` · ${ledger.company_name}` : ''}
              </p>

              <ul className="mt-4 grid gap-3 md:grid-cols-3">
                {checks.map((check) => (
                  <li
                    key={check.title}
                    className={`flex gap-3 rounded-xl border p-4 ${check.ok ? 'border-line' : 'border-danger/30 bg-danger/5'}`}
                  >
                    {check.ok ? (
                      <CheckCircle2 className="text-success mt-0.5 size-5 shrink-0" aria-hidden="true" />
                    ) : (
                      <CircleAlert className="text-danger mt-0.5 size-5 shrink-0" aria-hidden="true" />
                    )}
                    <span className="flex flex-col gap-0.5">
                      <span className="text-ink text-[14px] font-semibold">{check.title}</span>
                      <span className="text-muted-foreground text-[13px]">{check.body}</span>
                    </span>
                  </li>
                ))}
              </ul>

              {failingAccounts.length > 0 && (
                <ul className="text-danger mt-4 flex flex-col gap-1 text-[13px]">
                  {failingAccounts.map((c) => (
                    <li key={c.key}>
                      {t('ledgerAccountOff', { account: c.label, printed: money(c.expectedCents), summed: money(c.actualCents) })}
                    </li>
                  ))}
                </ul>
              )}

              {lines.length > 0 && (
                <div className="mt-5 overflow-x-auto">
                  <table className="w-full min-w-[640px] text-left text-[13.5px]">
                    <thead className="text-muted-foreground border-line border-b text-[12px] font-semibold tracking-[0.06em] uppercase">
                      <tr>
                        <th scope="col" className="px-3 py-2">{t('ledgerColLine')}</th>
                        <th scope="col" className="px-3 py-2 text-right">{t('ledgerColStatement')}</th>
                        <th scope="col" className="px-3 py-2 text-right">{t('ledgerColLedger')}</th>
                        <th scope="col" className="px-3 py-2 text-right">{t('ledgerColStatus')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-line divide-y">
                      {lines.map((line) => (
                        <tr key={line.lineId} className={line.status === 'matched' ? '' : 'bg-danger/5'}>
                          <th scope="row" className="text-ink px-3 py-2 font-medium">
                            {line.lineName}
                            {line.accountName && line.accountName !== line.lineName && (
                              <span className="text-muted-foreground block text-[12px] font-normal">{line.accountName}</span>
                            )}
                          </th>
                          <td className="px-3 py-2 text-right tabular-nums">{money(line.statementCents)}</td>
                          <td className={`px-3 py-2 text-right tabular-nums ${line.status === 'matched' ? '' : 'text-danger'}`}>
                            {line.ledgerCents === null ? '—' : money(line.ledgerCents)}
                          </td>
                          <td className={`px-3 py-2 text-right font-semibold ${line.status === 'matched' ? 'text-success' : 'text-danger'}`}>
                            {line.status === 'matched'
                              ? t('ledgerStatusMatched')
                              : line.status === 'missing'
                                ? t('ledgerStatusMissing')
                                : t('ledgerStatusApart', { amount: money(Math.abs((line.ledgerCents ?? 0) - line.statementCents)) })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {(review.match?.unmatched.length ?? 0) > 0 && (
                <div className="border-line mt-5 rounded-xl border p-4">
                  <h3 className="text-ink text-[14px] font-semibold">{t('ledgerUnmatchedTitle')}</h3>
                  <p className="text-muted-foreground mt-1 text-[13px] leading-[1.55]">
                    {t('ledgerUnmatchedBody', { count: review.match?.unmatched.length ?? 0 })}{' '}
                    {(review.match?.unmatched ?? []).map((a) => a.name).join(' · ')}
                  </p>
                </div>
              )}
            </section>
          );
        }),
      )}
    </>
  );
}
