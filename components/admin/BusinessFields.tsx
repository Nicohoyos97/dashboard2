'use client';

// The business half of a provisioning form: identity, branding, fiscal
// configuration, and what the client bought. Shared by EntityDialog (an extra
// business for an existing client) and ClientDialog (the first one, created
// with the client itself), so the two can never drift into offering different
// setups for the same row.
import { useLocale, useTranslations } from 'next-intl';

import { PACKAGE_MODULES, SERVICE_PACKAGES, type ServicePackage, packageOf } from '@/lib/portal/modules';
import { supportedTimeZones } from '@/lib/utils/timezone';

import { type EntityFormValues } from './business-form';
import { LogoField } from './LogoField';
import { SalesTaxFields } from './SalesTaxFields';
import { inputClass, labelClass, selectClass } from './ui';

// Suggestions only — the field is free text: a fixed list would not survive a
// real client roster.
const INDUSTRY_SUGGESTIONS = [
  'Restaurant',
  'Retail',
  'Construction',
  'Professional services',
  'Healthcare',
  'Real estate',
  'Transportation & logistics',
  'Manufacturing',
  'Nonprofit',
  'Technology',
];

// Resolved once at module load: the full IANA list is long and never changes
// during a session.
const ZONES = supportedTimeZones();

export function BusinessFields({
  values,
  onChange,
  onError,
  idPrefix = '',
}: {
  values: EntityFormValues;
  onChange: (values: EntityFormValues) => void;
  onError: (message: string | null) => void;
  /** Distinguishes the input ids when two forms can be open on one page. */
  idPrefix?: string;
}) {
  const t = useTranslations('Admin');
  const locale = useLocale();
  const id = (name: string) => `${idPrefix}${name}`;

  const months = Array.from({ length: 12 }, (_, i) =>
    new Intl.DateTimeFormat(locale, { month: 'long' }).format(new Date(2026, i, 1)),
  );

  function set<K extends keyof EntityFormValues>(key: K, value: EntityFormValues[K]) {
    onChange({ ...values, [key]: value });
  }

  // Sales tax lives in its own column, the rest in enabled_modules, so the form
  // reassembles both halves to name the package — and a custom mix names none.
  const selectedPackage = packageOf({
    ...values.enabledModules,
    sales_taxes: values.salesTaxEnabled,
  });

  function applyPackage(name: ServicePackage) {
    const modules = PACKAGE_MODULES[name];
    onChange({
      ...values,
      salesTaxEnabled: modules.sales_taxes,
      enabledModules: { bookkeeping: modules.bookkeeping, income_taxes: modules.income_taxes },
    });
  }

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor={id('entityName')} className={labelClass}>
            {t('businessName')}
          </label>
          <input
            id={id('entityName')}
            required
            value={values.name}
            onChange={(e) => set('name', e.target.value)}
            className={inputClass}
          />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor={id('entityLegalName')} className={labelClass}>
            {t('legalName')}
          </label>
          <input
            id={id('entityLegalName')}
            value={values.legalName}
            onChange={(e) => set('legalName', e.target.value)}
            className={inputClass}
          />
        </div>
        {/* Does this business trade under a DBA? Asked outright rather than
            left to an empty field: "no DBA" and "nobody asked" are different
            answers, and only one of them means the file is complete. Saying
            yes makes the name required — here, in the Server Action, and in
            the database (0021), which is also what stops a `no` from keeping
            a trade name somebody typed earlier. */}
        <fieldset className="sm:col-span-2">
          <legend className={labelClass}>{t('dbaQuestion')}</legend>
          <div className="mt-1.5 flex items-center gap-5 text-[14px]">
            {[false, true].map((answer) => (
              <label key={String(answer)} className="flex items-center gap-2">
                <input
                  type="radio"
                  name={id('hasDba')}
                  checked={values.hasDba === answer}
                  onChange={() =>
                    onChange({ ...values, hasDba: answer, dbaName: answer ? values.dbaName : '' })
                  }
                  className="accent-blue size-4"
                />
                {answer ? t('yes') : t('no')}
              </label>
            ))}
          </div>
        </fieldset>
        {values.hasDba && (
          <div className="sm:col-span-2">
            <label htmlFor={id('dbaName')} className={labelClass}>
              {t('dbaName')}
            </label>
            <input
              id={id('dbaName')}
              required
              value={values.dbaName}
              onChange={(e) => set('dbaName', e.target.value)}
              className={inputClass}
            />
          </div>
        )}
        <div className="sm:col-span-2">
          <label htmlFor={id('entityIndustry')} className={labelClass}>
            {t('industry')}
          </label>
          <input
            id={id('entityIndustry')}
            list={id('entityIndustryOptions')}
            value={values.industry}
            onChange={(e) => set('industry', e.target.value)}
            className={inputClass}
          />
          <datalist id={id('entityIndustryOptions')}>
            {INDUSTRY_SUGGESTIONS.map((option) => (
              <option key={option} value={option} />
            ))}
          </datalist>
        </div>
        <div className="sm:col-span-2">
          <span className={labelClass}>{t('logo')}</span>
          <LogoField value={values.logoUrl} onChange={(url) => set('logoUrl', url)} onError={onError} />
        </div>
        <div>
          <label htmlFor={id('fiscalMonth')} className={labelClass}>
            {t('fiscalYearStart')}
          </label>
          <select
            id={id('fiscalMonth')}
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
          <label htmlFor={id('basis')} className={labelClass}>
            {t('accountingBasis')}
          </label>
          <select
            id={id('basis')}
            value={values.accountingBasis}
            onChange={(e) => set('accountingBasis', e.target.value === 'accrual' ? 'accrual' : 'cash')}
            className={selectClass}
          >
            <option value="cash">{t('basisCash')}</option>
            <option value="accrual">{t('basisAccrual')}</option>
          </select>
        </div>
        <div>
          <label htmlFor={id('currency')} className={labelClass}>
            {t('currency')}
          </label>
          <input
            id={id('currency')}
            value={values.currency}
            maxLength={3}
            onChange={(e) => set('currency', e.target.value.toUpperCase())}
            className={inputClass}
          />
        </div>
      </div>

      {/* The calendar this business keeps: every due date and "today" in the
          client portal is resolved in it, so it is firm-set, not guessed. */}
      <div>
        <label htmlFor={id('timezone')} className={labelClass}>
          {t('timezone')}
        </label>
        <select
          id={id('timezone')}
          value={values.timezone}
          onChange={(e) => set('timezone', e.target.value)}
          className={selectClass}
        >
          {ZONES.map((zone) => (
            <option key={zone} value={zone}>
              {zone}
            </option>
          ))}
        </select>
        <p className="text-muted-foreground mt-1.5 text-[12.5px]">{t('timezoneHelp')}</p>
      </div>

      <fieldset className="border-line mt-1 rounded-xl border p-4">
        <legend className="text-muted-foreground px-1 text-[11px] font-semibold tracking-[0.12em] uppercase">
          {t('modules')}
        </legend>

        {/* What the client bought. The switches below stay editable, so an
            unusual engagement is still expressible — picking one of these
            just sets them all at once. */}
        <div className="mb-4 flex flex-wrap gap-2">
          {SERVICE_PACKAGES.map((name) => {
            const active = selectedPackage === name;
            return (
              <button
                key={name}
                type="button"
                aria-pressed={active}
                onClick={() => applyPackage(name)}
                className={
                  active
                    ? 'bg-blue rounded-full px-3 py-1.5 text-[13px] font-semibold text-white'
                    : 'border-line text-muted-foreground hover:bg-secondary rounded-full border px-3 py-1.5 text-[13px] font-semibold'
                }
              >
                {t(`package_${name}`)}
              </button>
            );
          })}
        </div>

        <div className="flex flex-col gap-3 text-[14px]">
          <Toggle
            label={t('moduleBookkeeping')}
            hint={t('moduleBookkeepingHint')}
            checked={values.enabledModules.bookkeeping}
            onChange={(checked) =>
              set('enabledModules', { ...values.enabledModules, bookkeeping: checked })
            }
          />
          <Toggle
            label={t('moduleIncomeTaxes')}
            hint={t('moduleIncomeTaxesHint')}
            checked={values.enabledModules.income_taxes}
            onChange={(checked) =>
              set('enabledModules', { ...values.enabledModules, income_taxes: checked })
            }
          />
          <Toggle
            label={t('moduleSalesTaxes')}
            hint={t('moduleSalesTaxesHint')}
            checked={values.salesTaxEnabled}
            onChange={(checked) => set('salesTaxEnabled', checked)}
          />
          {/* Selling the module and knowing where it is collected are one
              decision, so the jurisdiction is asked here rather than on a
              screen the firm has to remember to open. */}
          {values.salesTaxEnabled && (
            <SalesTaxFields
              values={values.salesTax}
              onChange={(salesTax) => set('salesTax', salesTax)}
              idPrefix={idPrefix}
            />
          )}
          <Toggle label={t('moduleNick')} hint={t('moduleNickHint')} checked disabled />
        </div>
      </fieldset>
    </>
  );
}

// A checkbox with its own explanation of what the client gains. `disabled`
// states a fact rather than offering a choice — Nick ships with every package,
// so showing it greyed on is honest where hiding it would leave the firm
// wondering whether they forgot to sell it.
function Toggle({
  label,
  hint,
  checked,
  onChange,
  disabled = false,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange?: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className={`flex items-start gap-2.5 ${disabled ? 'opacity-60' : ''}`}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange?.(e.target.checked)}
        className="accent-blue mt-0.5 size-4"
      />
      <span>
        <span className="text-ink font-medium">{label}</span>
        <span className="text-muted-foreground block text-[12.5px]">{hint}</span>
      </span>
    </label>
  );
}
