'use client';

// What the PRIOR column is measured against.
//
// The default is whatever comparative the published document itself prints —
// that is part of the statement, not something this app derived. Choosing
// another period puts two published statements side by side instead, which is
// a different claim, so the option says which it is and the page header
// restates it. Only periods of the same length and currency are offered:
// comparing a month against a year is arithmetic that means nothing.
import { GitCompareArrows } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { selectClass } from '@/components/admin/ui';
import { useSearchParams } from 'next/navigation';

import { usePathname, useRouter } from '@/i18n/navigation';

export type CompareOption = { value: string; label: string };

export function CompareSelector({
  options,
  current,
}: {
  /** The first entry is the document's own printed comparative, when it has one. */
  options: CompareOption[];
  current: string;
}) {
  const t = useTranslations('Statements');
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  if (options.length <= 1) return null;

  function choose(value: string) {
    const next = new URLSearchParams(params.toString());
    if (value === '') next.delete('compare');
    else next.set('compare', value);
    router.push(`${pathname}?${next.toString()}`);
  }

  return (
    <label className="text-muted-foreground flex items-center gap-2 text-[13.5px]">
      <GitCompareArrows className="size-4 shrink-0" aria-hidden="true" />
      <span className="font-medium whitespace-nowrap">{t('compareWith')}</span>
      <select
        aria-label={t('compareWith')}
        value={current}
        onChange={(event) => choose(event.target.value)}
        className={`${selectClass} h-10 w-auto min-w-[190px] text-[13.5px]`}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
