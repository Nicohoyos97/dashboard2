import { Download } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';

import type { TaxObligation } from '@/lib/reports/taxes';
import { formatIsoDate, formatPeriod } from '@/lib/utils/dates';

import { FilingBadge, TaxStatusBadge } from './TaxStatusBadge';

// One card per published obligation (§7). Every printed amount is shown with
// the label the firm gave the row; an amount the document does not print is
// omitted, never shown as zero. The original document is one click away
// through the audited download route.
export async function ObligationList({
  obligations,
  currency,
  kind,
}: {
  obligations: readonly TaxObligation[];
  currency: string;
  kind: 'income' | 'sales';
}) {
  const [t, locale] = await Promise.all([getTranslations('Taxes'), getLocale()]);
  const money = (cents: number) => new Intl.NumberFormat(locale, { style: 'currency', currency }).format(cents / 100);

  if (obligations.length === 0) return <p className="text-muted-foreground text-[14px]">{t('noObligations')}</p>;

  return (
    <ul className="flex flex-col gap-3">
      {obligations.map((obligation) => {
        const amounts: { label: string; cents: number | null }[] =
          kind === 'sales'
            ? [
                { label: t('amountTaxableSales'), cents: obligation.taxableSalesCents },
                { label: t('amountNonTaxableSales'), cents: obligation.nonTaxableSalesCents },
                { label: t('amountCollected'), cents: obligation.collectedCents },
                { label: t('amountPaid'), cents: obligation.paidCents },
                { label: t('amountPayable'), cents: obligation.payableCents },
              ]
            : [
                { label: t('amountEstimated'), cents: obligation.estimatedCents },
                { label: t('amountConfirmed'), cents: obligation.confirmedCents },
                { label: t('amountPaid'), cents: obligation.paidCents },
                { label: t('amountPayable'), cents: obligation.payableCents },
              ];
        const printed = amounts.filter((amount) => amount.cents !== null);
        const scope = obligation.jurisdiction?.name ?? t(kind === 'sales' ? 'salesTitle' : 'incomeTitle');
        const when =
          obligation.periodStart && obligation.periodEnd
            ? formatPeriod(obligation.periodStart, obligation.periodEnd, locale)
            : obligation.taxYear !== null
              ? String(obligation.taxYear)
              : null;

        return (
          <li key={obligation.id} className="border-line bg-card rounded-2xl border p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-ink text-[15px] font-semibold">{[scope, when].filter(Boolean).join(' · ')}</h3>
                <p className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px]">
                  {obligation.dueDate && <span>{t('dueOn', { date: formatIsoDate(obligation.dueDate, locale) })}</span>}
                  {obligation.dueDate && <span aria-hidden="true">·</span>}
                  <FilingBadge status={obligation.filingStatus} />
                  {obligation.jurisdiction?.filingFrequency && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>{t(`frequency_${obligation.jurisdiction.filingFrequency}`)}</span>
                    </>
                  )}
                  <span aria-hidden="true">·</span>
                  <span>{t(`source_${obligation.source}`)}</span>
                </p>
              </div>
              <TaxStatusBadge status={obligation.status} />
            </div>

            {printed.length > 0 && (
              <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {printed.map((amount) => (
                  <div key={amount.label}>
                    <dt className="text-muted-foreground text-[12px] font-medium">{amount.label}</dt>
                    <dd className="text-ink mt-1 text-[17px] font-bold tracking-[-0.01em] tabular-nums">{money(amount.cents ?? 0)}</dd>
                  </div>
                ))}
              </dl>
            )}
            {printed.length === 0 && <p className="text-muted-foreground mt-3 text-[13px]">{t('noAmountsPrinted')}</p>}

            {obligation.payments.length > 0 && (
              <div className="border-line-soft mt-4 border-t pt-3">
                <p className="text-muted-foreground text-[12px] font-medium">{t('paymentsTitle')}</p>
                <ul className="mt-2 flex flex-col gap-1.5 text-[13px]">
                  {obligation.payments.map((payment) => (
                    <li key={payment.id} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-ink font-semibold tabular-nums">{money(payment.amountCents)}</span>
                      <span className="text-muted-foreground">{formatIsoDate(payment.paidOn, locale)}</span>
                      {payment.method && <span className="text-muted-foreground">· {payment.method}</span>}
                      <span className="text-muted-foreground">
                        ·{' '}
                        {payment.confirmationNumber
                          ? t('confirmationNumber', { number: payment.confirmationNumber })
                          : t('noConfirmationNumber')}
                      </span>
                      {payment.documentVersionId && (
                        <a href={`/api/documents/${payment.documentVersionId}/download`} className="text-blue inline-flex items-center gap-1 font-semibold hover:underline">
                          <Download className="size-3.5" aria-hidden="true" />
                          {t('openDocument')}
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {obligation.notes && (
              <div className="border-line-soft mt-4 border-t pt-3">
                <p className="text-muted-foreground text-[12px] font-medium">{t('firmNote')}</p>
                <p className="text-ink mt-1 text-[13.5px] leading-[1.5]">{obligation.notes}</p>
              </div>
            )}

            {(obligation.confirmationNumber || obligation.documentVersionId) && (
              <div className="mt-4 flex flex-wrap items-center gap-3 text-[12.5px]">
                {obligation.confirmationNumber && (
                  <span className="text-muted-foreground">{t('confirmationNumber', { number: obligation.confirmationNumber })}</span>
                )}
                {obligation.documentVersionId && (
                  <a href={`/api/documents/${obligation.documentVersionId}/download`} className="text-blue inline-flex items-center gap-1 font-semibold hover:underline">
                    <Download className="size-3.5" aria-hidden="true" />
                    {obligation.pageNumber ? t('openDocumentPage', { page: obligation.pageNumber }) : t('openDocument')}
                  </a>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
