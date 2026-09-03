'use client';

import { useTranslations } from 'next-intl';

import { usePathname, useRouter } from '@/i18n/navigation';
import { selectClass } from '@/components/admin/ui';

export type PeriodOption = { value: string; label: string };

// Reporting-period selector (INITIAL_PROMPT.md §7): lists only periods that
// have published data; the choice lives in the URL so links stay shareable.
export function PeriodSelector({ options, current }: { options: PeriodOption[]; current: string }) {
  const t = useTranslations('Overview');
  const router = useRouter();
  const pathname = usePathname();
  if (options.length === 0) return null;

  return (
    <label className="flex items-center gap-2 text-[13.5px]">
      <span className="text-muted-foreground font-medium">{t('periodLabel')}</span>
      <select
        aria-label={t('periodLabel')}
        value={current}
        onChange={(e) => router.push(`${pathname}?period=${e.target.value}`)}
        className={`${selectClass} h-10 w-auto min-w-[200px] text-[13.5px]`}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
