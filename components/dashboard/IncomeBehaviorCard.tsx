import { ArrowRightLeft } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';

// Revenue and cash in intentionally remain separate: one is a P&L figure,
// the other is bank activity. We display them together but never combine them.
export async function IncomeBehaviorCard({
  revenueCents,
  cashInCents,
  currency,
}: {
  revenueCents: number | null;
  cashInCents: number | null;
  currency: string;
}) {
  const [t, locale] = await Promise.all([getTranslations('Overview'), getLocale()]);
  const money = (cents: number) => new Intl.NumberFormat(locale, { style: 'currency', currency }).format(cents / 100);

  return (
    <section className="border-line bg-card rounded-2xl border p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <h2 className="text-ink flex items-center gap-2 text-[16px] font-semibold">
        <ArrowRightLeft className="text-blue size-[18px]" aria-hidden="true" />
        {t('incomeTitle')}
      </h2>
      <p className="text-muted-foreground mt-1 text-[13px] leading-[1.45]">{t('incomeLede')}</p>
      {revenueCents === null && cashInCents === null ? (
        <p className="text-muted-foreground mt-4 text-[14px]">{t('incomeEmpty')}</p>
      ) : (
        <dl className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="bg-paper rounded-xl p-4">
            <dt className="text-muted-foreground text-[12px] font-medium">{t('kpiRevenue')}</dt>
            <dd className="text-ink mt-1 text-[20px] font-bold tabular-nums">
              {revenueCents === null ? '—' : money(revenueCents)}
            </dd>
            <dd className="text-muted-foreground mt-1 text-[11.5px]">{t('source_pnl')}</dd>
          </div>
          <div className="bg-paper rounded-xl p-4">
            <dt className="text-muted-foreground text-[12px] font-medium">{t('kpiCashIn')}</dt>
            <dd className="text-ink mt-1 text-[20px] font-bold tabular-nums">
              {cashInCents === null ? '—' : money(cashInCents)}
            </dd>
            <dd className="text-muted-foreground mt-1 text-[11.5px]">{t('source_bank')}</dd>
          </div>
        </dl>
      )}
    </section>
  );
}
