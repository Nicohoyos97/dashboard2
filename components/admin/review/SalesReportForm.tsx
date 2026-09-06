'use client';

import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';

import { useRouter } from '@/i18n/navigation';
import { correctSalesReport } from '@/lib/documents/sales-report';

import { inputClass, labelClass, primaryButton } from '../ui';

export type SalesReportValues = {
  grossSales: string;
  netSales: string;
  refunds: string;
  discounts: string;
  tips: string;
  taxCollected: string;
  taxExpected: string;
  amountCollected: string;
};

// Correcting an extracted point-of-sale report by hand, the same contract as
// the statement line editor: the firm types the figure the document actually
// prints, the reconciliation is recomputed from what is stored, and the status
// follows. Empty means "not printed on the report" and is stored as null —
// never as zero, which would read as a fact the report never stated.
export function SalesReportForm({
  reportId,
  initial,
  canEdit,
}: {
  reportId: string;
  initial: SalesReportValues;
  canEdit: boolean;
}) {
  const t = useTranslations('Admin');
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (!canEdit) return null;

  const fields: [keyof SalesReportValues, string][] = [
    ['grossSales', t('salesGross')],
    ['refunds', t('salesRefunds')],
    ['discounts', t('salesDiscounts')],
    ['netSales', t('salesNet')],
    ['tips', t('salesTips')],
    ['taxCollected', t('salesTaxCollected')],
    ['taxExpected', t('salesTaxExpected')],
    ['amountCollected', t('salesAmountCollected')],
  ];

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const res = await correctSalesReport({ reportId, ...values });
      if (!res.ok) return setError(res.error);
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="border-line mt-5 rounded-xl border p-4">
      <h3 className="text-muted-foreground text-[11px] font-semibold tracking-[0.12em] uppercase">
        {t('correctionTitle')}
      </h3>
      <p className="text-muted-foreground mt-1.5 text-[12.5px]">{t('correctionLede')}</p>

      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {fields.map(([key, label]) => (
          <div key={key}>
            <label htmlFor={`sr-${key}`} className={labelClass}>
              {label}
            </label>
            <input
              id={`sr-${key}`}
              inputMode="decimal"
              value={values[key]}
              onChange={(e) => {
                setValues((v) => ({ ...v, [key]: e.target.value }));
                setSaved(false);
              }}
              className={`${inputClass} tabular-nums`}
            />
          </div>
        ))}
      </div>

      {error && (
        <p role="alert" className="text-danger mt-3 text-[13.5px]">
          {error}
        </p>
      )}
      <div className="mt-4 flex items-center justify-end gap-4">
        {saved && <span className="text-success text-[13.5px] font-medium">{t('correctionSaved')}</span>}
        <button type="submit" disabled={isPending} className={primaryButton}>
          {isPending ? t('saving') : t('correctionSave')}
        </button>
      </div>
    </form>
  );
}
