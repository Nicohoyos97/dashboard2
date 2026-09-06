'use client';

import { Check } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';

import { useRouter } from '@/i18n/navigation';
import { recordTaxPayment } from '@/lib/firm/tax-payments';
import { formatCents } from '@/lib/money';
import { formatIsoDate, formatPeriod } from '@/lib/utils/dates';

import { inputClass, labelClass, primaryButton, secondaryButton, statusPill } from './ui';

export type ObligationItem = {
  id: string;
  taxType: string;
  periodStart: string | null;
  periodEnd: string | null;
  dueDate: string | null;
  status: string;
  payableCents: number | null;
  paidCents: number | null;
  currency: string;
  published: boolean;
  /** `amount` is the raw string the form edits; `amountCents` is what is displayed. */
  payment: { paidOn: string; amount: string; amountCents: number; confirmationNumber: string; method: string } | null;
};

// What each period owes, and the one thing the firm could not do from here:
// say it has been paid. Most payments are an ACH transfer whose confirmation
// is a number in an email, with no document to upload — the pipeline's path
// needed one, so a settled quarter sat on the client's portal as a balance.
export function TaxObligations({
  items,
  canEdit,
}: {
  items: ObligationItem[];
  canEdit: boolean;
}) {
  const t = useTranslations('Admin');
  const locale = useLocale();
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(null);

  if (items.length === 0) {
    return <p className="text-muted-foreground mt-2 text-[14px]">{t('noObligations')}</p>;
  }

  return (
    <ul className="divide-line mt-4 divide-y">
      {items.map((item) => (
        <li key={item.id} className="py-3.5">
          <div className="flex flex-wrap items-center gap-3 text-[14px]">
            <span className="text-ink min-w-0 flex-1 font-semibold">
              {t(`taxType_${item.taxType}`)} · {formatPeriod(item.periodStart, item.periodEnd, locale)}
            </span>
            {item.dueDate && (
              <span className="text-muted-foreground">
                {t('dueOn', { date: formatIsoDate(item.dueDate, locale) })}
              </span>
            )}
            <span className="text-ink tabular-nums">
              {item.payableCents === null ? '—' : formatCents(item.payableCents, item.currency)}
            </span>
            <span className={statusPill(item.status === 'paid' ? 'published' : item.status)}>
              {t(`obligationStatus_${item.status}`)}
            </span>
            {canEdit && (
              <button
                type="button"
                onClick={() => setOpen(open === item.id ? null : item.id)}
                className={secondaryButton}
              >
                {item.status === 'paid' ? t('editPayment') : t('markPaid')}
              </button>
            )}
          </div>

          {item.status === 'paid' && item.payment && (
            <p className="text-muted-foreground mt-1.5 text-[12.5px]">
              {t('paidOn', {
                date: formatIsoDate(item.payment.paidOn, locale),
                amount: formatCents(item.payment.amountCents, item.currency),
              })}
              {item.payment.confirmationNumber && ` · ${item.payment.confirmationNumber}`}
            </p>
          )}

          {open === item.id && (
            <PaymentForm
              item={item}
              onDone={() => {
                setOpen(null);
                router.refresh();
              }}
            />
          )}
        </li>
      ))}
    </ul>
  );
}

function PaymentForm({ item, onDone }: { item: ObligationItem; onDone: () => void }) {
  const t = useTranslations('Admin');
  const [paidOn, setPaidOn] = useState(item.payment?.paidOn ?? new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState(
    item.payment?.amount ?? (item.payableCents === null ? '' : (item.payableCents / 100).toFixed(2)),
  );
  const [confirmationNumber, setConfirmation] = useState(item.payment?.confirmationNumber ?? '');
  const [method, setMethod] = useState(item.payment?.method ?? '');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await recordTaxPayment({
        obligationId: item.id,
        paidOn,
        amount,
        confirmationNumber,
        method,
      });
      if (!res.ok) return setError(res.error);
      onDone();
    });
  }

  return (
    <div className="border-line bg-paper mt-3 grid gap-4 rounded-xl border p-4 sm:grid-cols-4">
      <div>
        <label htmlFor={`paid-${item.id}`} className={labelClass}>
          {t('paymentDate')}
        </label>
        <input
          id={`paid-${item.id}`}
          type="date"
          value={paidOn}
          onChange={(e) => setPaidOn(e.target.value)}
          className={inputClass}
        />
      </div>
      <div>
        <label htmlFor={`amt-${item.id}`} className={labelClass}>
          {t('paymentAmount')}
        </label>
        <input
          id={`amt-${item.id}`}
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className={`${inputClass} tabular-nums`}
        />
      </div>
      <div>
        <label htmlFor={`conf-${item.id}`} className={labelClass}>
          {t('paymentConfirmation')}
        </label>
        <input
          id={`conf-${item.id}`}
          value={confirmationNumber}
          onChange={(e) => setConfirmation(e.target.value)}
          className={inputClass}
        />
      </div>
      <div>
        <label htmlFor={`meth-${item.id}`} className={labelClass}>
          {t('paymentMethod')}
        </label>
        <input
          id={`meth-${item.id}`}
          value={method}
          onChange={(e) => setMethod(e.target.value)}
          className={inputClass}
        />
      </div>

      {error && (
        <p role="alert" className="text-danger text-[13.5px] sm:col-span-4">
          {error}
        </p>
      )}
      {/* The client sees a payment only once it is published, so one on a
          published obligation is published with it — a status that says
          settled with nothing behind it explains nothing. */}
      <p className="text-muted-foreground text-[12.5px] sm:col-span-3">
        {item.published ? t('paymentVisibleNow') : t('paymentVisibleOnPublish')}
      </p>
      <button
        type="button"
        disabled={isPending || amount.trim() === ''}
        onClick={submit}
        className={`${primaryButton} sm:col-span-1`}
      >
        <Check className="size-4" aria-hidden="true" />
        {isPending ? t('saving') : t('markPaid')}
      </button>
    </div>
  );
}
