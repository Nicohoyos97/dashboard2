'use client';

import { usePathname, useRouter } from '@/i18n/navigation';
import { selectClass } from '@/components/admin/ui';

export type SelectorOption = { value: string; label: string };

/**
 * A page filter that lives in one search param, so the view stays shareable and
 * the back button works. Selecting the option whose value is `''` drops the
 * param rather than sending an empty one.
 */
export function QuerySelector({
  param,
  label,
  options,
  current,
  keep = [],
}: {
  param: string;
  label: string;
  options: SelectorOption[];
  current: string;
  /** Other params to carry across, as [name, value] pairs. */
  keep?: readonly (readonly [string, string])[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  if (options.length === 0) return null;

  return (
    <label className="flex items-center gap-2 text-[13.5px]">
      <span className="text-muted-foreground font-medium">{label}</span>
      <select
        aria-label={label}
        value={current}
        onChange={(event) => {
          const search = new URLSearchParams(keep.flatMap(([name, value]) => (value === '' ? [] : [[name, value] as [string, string]])));
          if (event.target.value !== '') search.set(param, event.target.value);
          const query = search.toString();
          router.push(query ? `${pathname}?${query}` : pathname);
        }}
        className={`${selectClass} h-10 w-auto min-w-[160px] text-[13.5px]`}
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
