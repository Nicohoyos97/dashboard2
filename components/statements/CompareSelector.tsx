'use client';

// What the PRIOR column is measured against, asked the same way the period is:
// "last quarter", "last year", or a named published period.
//
// The default is whatever comparative the published document itself prints —
// that is part of the statement, not something this app derived. Choosing a
// period instead puts two published statements side by side, which is a
// different claim, so the page header restates which one is on screen.
//
// A preset with no comparable published statement behind it is shown but
// cannot be chosen: comparing against a period that has no report is not a
// comparison, and accepting the click only to fall back would mislead. Only
// periods of the same length and currency reach this list at all — comparing a
// month against a year is arithmetic that means nothing.
import { GitCompareArrows } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { PeriodPicker, type PeriodChoice } from '@/components/dashboard/PeriodPicker';

export type CompareProps = {
  /** "As printed on the statement" — always selectable. */
  leading: PeriodChoice[];
  presets: PeriodChoice[];
  published: PeriodChoice[];
  current: string;
  currentLabel: string;
};

export function CompareSelector({
  leading,
  presets,
  published,
  current,
  currentLabel,
}: CompareProps) {
  const t = useTranslations('Statements');
  // Nothing comparable was published, so there is no choice to offer.
  if (published.length === 0) return null;

  return (
    <PeriodPicker
      param="compare"
      label={t('compareWith')}
      icon={<GitCompareArrows className="text-muted-foreground size-4 shrink-0" aria-hidden="true" />}
      leading={leading}
      presets={presets}
      published={published}
      current={current}
      currentLabel={currentLabel}
      // A free range has no statement behind it, so there is nothing to
      // compare against; the list is the published periods and their names.
      allowCustom={false}
      requirePublished
      customFrom=""
      customTo=""
    />
  );
}
