'use client';

import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRef } from 'react';

import { inputClass, secondaryButton, selectClass } from '@/components/admin/ui';
import { Link, useRouter } from '@/i18n/navigation';

export type FilterOption = { value: string; label: string };

export type ExpenseFilterValues = {
  category: string;
  vendor: string;
  account: string;
  recurring: string;
  q: string;
  min: string;
  max: string;
};

// Filters for the Expenses page (§7). Everything lives in the URL, so this is
// a GET form: selects apply on change, text and amount fields on submit, and
// the page re-renders on the server with the new query. `period` rides along
// in a hidden field so filtering never drops the reporting period.
export function ExpenseFilterBar({
  path,
  period,
  sort,
  values,
  categories,
  vendors,
  accounts,
  activeCount,
}: {
  path: string;
  period: string | null;
  /** The table's sort, carried through every filter change rather than reset. */
  sort: string | null;
  values: ExpenseFilterValues;
  categories: FilterOption[];
  vendors: FilterOption[];
  accounts: FilterOption[];
  activeCount: number;
}) {
  const t = useTranslations('Expenses');
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);

  const submit = () => {
    const data = new FormData(form.current ?? undefined);
    const search = new URLSearchParams();
    for (const [key, value] of data.entries()) {
      if (typeof value === 'string' && value.trim() !== '') search.set(key, value.trim());
    }
    const query = search.toString();
    router.push(query ? `${path}?${query}` : path);
  };

  return (
    <form
      ref={form}
      role="search"
      aria-label={t('filtersLabel')}
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      className="border-line bg-card rounded-2xl border p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
    >
      {period && <input type="hidden" name="period" value={period} />}
      {sort && <input type="hidden" name="sort" value={sort} />}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <label className="block">
          <span className="text-muted-foreground mb-1.5 block text-[12.5px] font-medium">{t('filterSearch')}</span>
          <input name="q" type="search" defaultValue={values.q} placeholder={t('filterSearchPlaceholder')} className={`${inputClass} h-10 text-[13.5px]`} />
        </label>
        <label className="block">
          <span className="text-muted-foreground mb-1.5 block text-[12.5px] font-medium">{t('filterCategory')}</span>
          <select name="category" defaultValue={values.category} onChange={submit} className={`${selectClass} h-10 text-[13.5px]`}>
            <option value="">{t('filterAll')}</option>
            {categories.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-muted-foreground mb-1.5 block text-[12.5px] font-medium">{t('filterVendor')}</span>
          <select name="vendor" defaultValue={values.vendor} onChange={submit} className={`${selectClass} h-10 text-[13.5px]`}>
            <option value="">{t('filterAll')}</option>
            {vendors.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-muted-foreground mb-1.5 block text-[12.5px] font-medium">{t('filterAccount')}</span>
          <select name="account" defaultValue={values.account} onChange={submit} className={`${selectClass} h-10 text-[13.5px]`}>
            <option value="">{t('filterAll')}</option>
            {accounts.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-muted-foreground mb-1.5 block text-[12.5px] font-medium">{t('filterRecurring')}</span>
          <select name="recurring" defaultValue={values.recurring} onChange={submit} className={`${selectClass} h-10 text-[13.5px]`}>
            <option value="">{t('filterAll')}</option>
            <option value="yes">{t('recurringYes')}</option>
            <option value="no">{t('recurringNo')}</option>
          </select>
        </label>
        <label className="block">
          <span className="text-muted-foreground mb-1.5 block text-[12.5px] font-medium">{t('filterMin')}</span>
          <input name="min" inputMode="decimal" defaultValue={values.min} placeholder="0.00" className={`${inputClass} h-10 text-[13.5px]`} />
        </label>
        <label className="block">
          <span className="text-muted-foreground mb-1.5 block text-[12.5px] font-medium">{t('filterMax')}</span>
          <input name="max" inputMode="decimal" defaultValue={values.max} placeholder="0.00" className={`${inputClass} h-10 text-[13.5px]`} />
        </label>
        <div className="flex items-end gap-2">
          <button type="submit" className={`${secondaryButton} h-10 flex-1`}>
            {t('filterApply')}
          </button>
          {activeCount > 0 && (
            <Link href={clearHref(path, period, sort)} className={`${secondaryButton} h-10 px-3`} aria-label={t('filterClear')}>
              <X className="size-4" aria-hidden="true" />
            </Link>
          )}
        </div>
      </div>
      {activeCount > 0 && <p className="text-muted-foreground mt-3 text-[12.5px]">{t('filtersActive', { count: activeCount })}</p>}
    </form>
  );
}

function clearHref(path: string, period: string | null, sort: string | null): string {
  const search = new URLSearchParams();
  if (period) search.set('period', period);
  if (sort) search.set('sort', sort);
  const query = search.toString();
  return query ? `${path}?${query}` : path;
}
