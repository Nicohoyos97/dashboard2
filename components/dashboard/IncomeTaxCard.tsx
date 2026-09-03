import { Landmark } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';

import { Link } from '@/i18n/navigation';
import type { TaxObligation } from '@/lib/reports/taxes';
import { nextDueDate, remainingOwed, sumField } from '@/lib/reports/taxes';
import { formatIsoDate } from '@/lib/utils/dates';

/**
 * Projected income tax for the latest published tax year (§7). "Projected" is
 * the firm's own `amount_estimated`, never a number we derive: the portal does
 * not forecast tax. Every figure keeps the firm's status, so an estimate reads
 * as an estimate until it is confirmed.
 */
export async function IncomeTaxCard({
  obligations,
  currency,
  today,
}: {
  obligations: readonly TaxObligation[];
  currency: string;
  today: string;
}) {
  const [t, tTax, locale] = await Promise.all([
    getTranslations('Overview'),
    getTranslations('Taxes'),
    getLocale(),
  ]);
  const money = (cents: number) => new Intl.NumberFormat(locale, { style: 'currency', currency }).format(cents / 100);

  const years = [...new Set(obligations.flatMap((o) => (o.taxYear === null ? [] : [o.taxYear])))].sort((a, b) => b - a);
  const year = years[0] ?? null;
  const rows = year === null ? obligations : obligations.filter((o) => o.taxYear === year);
  const projected = sumField(rows, (o) => o.estimatedCents ?? o.confirmedCents);
  const paid = sumField(rows, (o) => o.paidCents);
  const remaining = remainingOwed(rows);
  const due = nextDueDate(rows, today);
  const anyConfirmed = rows.some((o) => o.status === 'firm_confirmed');

  return (
    <section className="border-line bg-card flex flex-col rounded-2xl border p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      {/* The badge rides with the title rather than the far edge, so a narrow
          column never orphans it onto its own line below the lede. */}
      <h2 className="text-ink flex items-center gap-2 text-[16px] font-semibold">
        <Landmark className="text-blue size-[18px] shrink-0" aria-hidden="true" />
        <span className="min-w-0 truncate">{t('incomeTaxTitle')}</span>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[12px] font-semibold ${anyConfirmed ? 'bg-success/10 text-success' : 'bg-secondary text-muted-foreground'}`}>
          {anyConfirmed ? tTax('status_firm_confirmed') : tTax('status_estimated')}
        </span>
      </h2>
      <p className="text-muted-foreground mt-1 text-[13px] leading-[1.45]">
        {year === null ? t('incomeTaxLede') : t('incomeTaxLedeYear', { year })}
      </p>

      {rows.length === 0 ? (
        <p className="text-muted-foreground mt-4 text-[14px]">{t('incomeTaxEmpty')}</p>
      ) : (
        <>
          <dl className="mt-4 grid gap-3 sm:grid-cols-3">
            <Figure label={t('incomeTaxProjected')} value={projected === null ? null : money(projected)} fallback={tTax('notPrinted')} />
            <Figure label={t('incomeTaxPaid')} value={paid === null ? null : money(paid)} fallback={tTax('nothingRecordedPaid')} />
            <Figure
              label={t('incomeTaxRemaining')}
              value={remaining === null ? null : money(remaining.cents)}
              fallback={tTax('notPrinted')}
              {...(remaining ? { note: tTax(`basis_${remaining.basis}`) } : {})}
            />
          </dl>
          <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-4 text-[12.5px]">
            <span className="text-muted-foreground">
              {due === null ? tTax('noUpcomingDue') : tTax('dueOn', { date: formatIsoDate(due, locale) })}
            </span>
            <Link href="/taxes/income" className="text-blue font-semibold hover:underline">
              {t('viewDetail')}
            </Link>
          </div>
        </>
      )}
    </section>
  );
}

function Figure({ label, value, fallback, note }: { label: string; value: string | null; fallback: string; note?: string }) {
  return (
    <div className="bg-paper rounded-xl p-4">
      <dt className="text-muted-foreground text-[12px] font-medium">{label}</dt>
      {value === null ? (
        <dd className="text-muted-foreground mt-1 text-[13px] leading-snug">{fallback}</dd>
      ) : (
        <dd className="text-ink mt-1 text-[20px] font-bold tabular-nums">{value}</dd>
      )}
      {value !== null && note && <dd className="text-muted-foreground mt-1 text-[11.5px] leading-[1.35]">{note}</dd>}
    </div>
  );
}
