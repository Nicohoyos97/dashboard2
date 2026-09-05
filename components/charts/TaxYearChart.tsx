'use client';

// Income tax across tax years: two columns per year — what the return projects
// against what has been paid — and a line for the liability still outstanding.
// One picture answers both questions an owner has: did we set enough aside,
// and where does it stand now.
//
// A year that prints no figure is left out by the caller rather than drawn at
// zero: a zero column reads as "nothing owed", which is a different claim from
// "not stated" (spec §3).
//
// The drawing loads on demand; the legend and the text equivalent are rendered
// on the server, so neither waits on Recharts.
import { useTranslations } from 'next-intl';
import dynamic from 'next/dynamic';

import { LIABILITY, SERIES } from '@/lib/charts/palette';

import { ChartSkeleton } from './ChartSkeleton';
import type { TaxYearChartPoint } from './plot/TaxYearPlot';

export type { TaxYearChartPoint };

const TaxYearPlot = dynamic(() => import('./plot/TaxYearPlot').then((m) => m.TaxYearPlot), {
  ssr: false,
  loading: () => <ChartSkeleton />,
});

export function TaxYearChart({
  points,
  currency,
  summary,
}: {
  points: TaxYearChartPoint[];
  currency: string;
  summary: string;
}) {
  const t = useTranslations('Taxes');

  return (
    <figure>
      <ul className="text-muted-foreground mb-2 flex flex-wrap items-center gap-4 text-[12.5px]">
        <li className="flex items-center gap-2">
          <span
            className="size-2.5 rounded-full"
            style={{ background: SERIES.primary }}
            aria-hidden="true"
          />
          {t('chartProjected')}
        </li>
        <li className="flex items-center gap-2">
          <span
            className="size-2.5 rounded-full"
            style={{ background: SERIES.secondary }}
            aria-hidden="true"
          />
          {t('chartPaid')}
        </li>
        <li className="flex items-center gap-2">
          <span
            className="h-0.5 w-4 rounded-full"
            style={{ background: LIABILITY }}
            aria-hidden="true"
          />
          {t('chartRemaining')}
        </li>
      </ul>
      <div aria-hidden="true" className="h-[260px] w-full">
        <TaxYearPlot points={points} currency={currency} />
      </div>
      {/* Every chart ships a text equivalent (§1). */}
      <figcaption className="sr-only">{summary}</figcaption>
    </figure>
  );
}
