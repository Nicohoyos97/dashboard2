'use client';

import { Plus } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useRouter } from '@/i18n/navigation';
import { type EntityConfigInput, createEntity, updateEntityConfig } from '@/lib/firm/entities';

import { inputClass, labelClass, primaryButton, secondaryButton, selectClass } from './ui';

export type EntityFormValues = Omit<EntityConfigInput, 'clientId'>;

const EMPTY: EntityFormValues = {
  name: '',
  legalName: '',
  fiscalYearStartMonth: 1,
  accountingBasis: 'cash',
  currency: 'USD',
  salesTaxEnabled: false,
  enabledModules: { expenses: true, income_taxes: true },
};

// Create / edit a business and its firm-controlled configuration (§5 columns).
export function EntityDialog({
  mode,
  clientId,
  entityId,
  initial,
}: {
  mode: 'create' | 'edit';
  clientId?: string;
  entityId?: string;
  initial?: EntityFormValues;
}) {
  const t = useTranslations('Admin');
  const locale = useLocale();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<EntityFormValues>(initial ?? EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const months = Array.from({ length: 12 }, (_, i) =>
    new Intl.DateTimeFormat(locale, { month: 'long' }).format(new Date(2026, i, 1)),
  );

  function set<K extends keyof EntityFormValues>(key: K, value: EntityFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      if (mode === 'create') {
        const res = await createEntity({ clientId, ...values });
        if (!res.ok) return setError(res.error);
        setOpen(false);
        router.push(`/admin/entities/${res.value.id}`);
        return;
      }
      const res = await updateEntityConfig({ id: entityId, ...values });
      if (!res.ok) return setError(res.error);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button type="button" className={mode === 'create' ? primaryButton : secondaryButton}>
          {mode === 'create' && <Plus className="size-4" aria-hidden="true" />}
          {mode === 'create' ? t('newBusiness') : t('editBusiness')}
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? t('newBusiness') : t('editBusiness')}</DialogTitle>
          <DialogDescription>{t('configTitle')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="entityName" className={labelClass}>
                {t('businessName')}
              </label>
              <input
                id="entityName"
                required
                value={values.name}
                onChange={(e) => set('name', e.target.value)}
                className={inputClass}
              />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="entityLegalName" className={labelClass}>
                {t('legalName')}
              </label>
              <input
                id="entityLegalName"
                value={values.legalName}
                onChange={(e) => set('legalName', e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="fiscalMonth" className={labelClass}>
                {t('fiscalYearStart')}
              </label>
              <select
                id="fiscalMonth"
                value={values.fiscalYearStartMonth}
                onChange={(e) => set('fiscalYearStartMonth', Number(e.target.value))}
                className={selectClass}
              >
                {months.map((m, i) => (
                  <option key={m} value={i + 1}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="basis" className={labelClass}>
                {t('accountingBasis')}
              </label>
              <select
                id="basis"
                value={values.accountingBasis}
                onChange={(e) => set('accountingBasis', e.target.value === 'accrual' ? 'accrual' : 'cash')}
                className={selectClass}
              >
                <option value="cash">{t('basisCash')}</option>
                <option value="accrual">{t('basisAccrual')}</option>
              </select>
            </div>
            <div>
              <label htmlFor="currency" className={labelClass}>
                {t('currency')}
              </label>
              <input
                id="currency"
                value={values.currency}
                maxLength={3}
                onChange={(e) => set('currency', e.target.value.toUpperCase())}
                className={inputClass}
              />
            </div>
          </div>

          <fieldset className="border-line mt-1 rounded-xl border p-4">
            <legend className="text-muted-foreground px-1 text-[11px] font-semibold tracking-[0.12em] uppercase">
              {t('modules')}
            </legend>
            <div className="flex flex-col gap-2.5 text-[14px]">
              <label className="flex items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={values.enabledModules.expenses}
                  onChange={(e) =>
                    set('enabledModules', { ...values.enabledModules, expenses: e.target.checked })
                  }
                  className="accent-blue size-4"
                />
                {t('moduleExpenses')}
              </label>
              <label className="flex items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={values.enabledModules.income_taxes}
                  onChange={(e) =>
                    set('enabledModules', {
                      ...values.enabledModules,
                      income_taxes: e.target.checked,
                    })
                  }
                  className="accent-blue size-4"
                />
                {t('moduleIncomeTaxes')}
              </label>
              <label className="flex items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={values.salesTaxEnabled}
                  onChange={(e) => set('salesTaxEnabled', e.target.checked)}
                  className="accent-blue size-4"
                />
                {t('salesTaxEnabled')}
              </label>
            </div>
          </fieldset>

          {error && (
            <p role="alert" className="text-danger text-[13.5px]">
              {error}
            </p>
          )}
          <div className="mt-2 flex justify-end gap-3">
            <button type="button" onClick={() => setOpen(false)} className={secondaryButton}>
              {t('cancel')}
            </button>
            <button
              type="submit"
              disabled={isPending || values.name.trim().length === 0}
              className={primaryButton}
            >
              {isPending
                ? mode === 'create'
                  ? t('creating')
                  : t('saving')
                : mode === 'create'
                  ? t('create')
                  : t('save')}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
