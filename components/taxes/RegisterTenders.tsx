'use client';

// How the client's register took the money, one period at a time: credit
// cards, cash, DoorDash, Grubhub — each as printed on the report, each a bar.
//
// The month pills switch between the published periods already on the page, so
// the switch is instant and costs no round trip. They are the only control
// here: the period is named on the pill, which is why this card carries no
// source line under its title any more.
import { useState } from 'react';
import { useTranslations } from 'next-intl';

import { AmountBars } from '@/components/charts/AmountBars';
import { fullMoney } from '@/components/charts/format';

export type RegisterPeriod = {
  id: string;
  /** The period as a pill reads it — "Aug 2026". */
  label: string;
  collectedCents: number | null;
  tenders: { id: string; label: string; cents: number }[];
};

export function RegisterTenders({ periods, currency }: { periods: RegisterPeriod[]; currency: string }) {
  const t = useTranslations('Taxes');
  const [selectedId, setSelectedId] = useState(periods[periods.length - 1]?.id ?? '');
  const period = periods.find((candidate) => candidate.id === selectedId) ?? periods[periods.length - 1];
  if (!period) return null;

  return (
    <section className="border-line bg-card flex flex-col rounded-2xl border p-6">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h2 className="text-ink text-[18px] font-bold tracking-[-0.01em]">{t('posTitle')}</h2>
        {periods.length > 1 && (
          <div role="group" aria-label={t('registerPeriodLabel')} className="flex flex-wrap gap-1.5">
            {periods.map((candidate) => {
              const active = candidate.id === period.id;
              return (
                <button
                  key={candidate.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setSelectedId(candidate.id)}
                  className={`focus-visible:ring-blue/40 rounded-full px-2.5 py-1 text-[12px] font-semibold transition-colors outline-none focus-visible:ring-3 ${
                    active
                      ? 'bg-blue text-white'
                      : 'border-line text-muted-foreground hover:bg-secondary border'
                  }`}
                >
                  {candidate.label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {period.collectedCents !== null && (
        <p className="mt-4">
          <span className="text-muted-foreground block text-[12.5px]">{t('posCollected')}</span>
          <span className="text-ink block text-[19px] font-bold tabular-nums">
            {fullMoney(period.collectedCents, currency)}
          </span>
        </p>
      )}

      <div className="mt-5 flex-1">
        {period.tenders.length > 0 ? (
          <AmountBars
            currency={currency}
            items={period.tenders.map((tender) => ({ label: tender.label, cents: tender.cents }))}
          />
        ) : (
          <p className="text-muted-foreground text-[14px]">{t('notPrinted')}</p>
        )}
      </div>
    </section>
  );
}
