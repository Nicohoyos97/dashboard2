'use client';

// Where a business collects sales tax, asked the moment the firm turns the
// module on. Sitting under the switch rather than in a section of its own is
// the point: selling the module and knowing the jurisdiction are one decision,
// and a client whose portal has a Sales Taxes page with nowhere on file is a
// record that looks complete and is not.
//
// The state is a closed list — one misspelling would live in the client's
// portal forever — and the cities are free text, because the body that levies
// the local tax is whatever the registration calls it: "City of Niles",
// "Village of Skokie".
import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import type { SalesTaxRegistration } from '@/lib/firm/schemas';
import { US_STATES } from '@/lib/taxes/us-jurisdictions';

import { inputClass, labelClass, secondaryButton, selectClass } from './ui';

export function SalesTaxFields({
  values,
  onChange,
  idPrefix = '',
}: {
  values: SalesTaxRegistration;
  onChange: (values: SalesTaxRegistration) => void;
  idPrefix?: string;
}) {
  const t = useTranslations('Admin');
  const [draft, setDraft] = useState('');
  const id = (name: string) => `${idPrefix}${name}`;

  function addCity() {
    const city = draft.trim();
    setDraft('');
    // Same city twice is one registration, so the second is dropped rather than
    // refused: the firm typed a name that is already on the list.
    if (city === '' || values.cities.some((existing) => existing.toLowerCase() === city.toLowerCase())) return;
    onChange({ ...values, cities: [...values.cities, city] });
  }

  return (
    <div className="border-line ml-6 flex flex-col gap-4 border-l pl-4">
      <div>
        <label htmlFor={id('salesTaxState')} className={labelClass}>
          {t('salesTaxState')}
        </label>
        <select
          id={id('salesTaxState')}
          required
          value={values.state}
          onChange={(e) => onChange({ ...values, state: e.target.value })}
          className={selectClass}
        >
          <option value="">{t('salesTaxStatePlaceholder')}</option>
          {US_STATES.map((state) => (
            <option key={state.code} value={state.code}>
              {state.name}
            </option>
          ))}
        </select>
      </div>

      <fieldset>
        <legend className={labelClass}>{t('salesTaxCityQuestion')}</legend>
        <div className="mt-1.5 flex items-center gap-5 text-[14px]">
          {[false, true].map((answer) => (
            <label key={String(answer)} className="flex items-center gap-2">
              <input
                type="radio"
                name={id('hasCityTax')}
                checked={values.hasCityTax === answer}
                // Answering "no" drops the cities: a city typed and then
                // retracted must not reach the client's portal.
                onChange={() => onChange({ ...values, hasCityTax: answer, cities: answer ? values.cities : [] })}
                className="accent-blue size-4"
              />
              {answer ? t('yes') : t('no')}
            </label>
          ))}
        </div>
      </fieldset>

      {values.hasCityTax && (
        <div>
          <label htmlFor={id('salesTaxCity')} className={labelClass}>
            {t('salesTaxCities')}
          </label>
          <div className="flex gap-2">
            <input
              id={id('salesTaxCity')}
              value={draft}
              placeholder={t('salesTaxCityPlaceholder')}
              onChange={(e) => setDraft(e.target.value)}
              // Enter belongs to this field while it has something in it —
              // without this it submits the whole provisioning form and the
              // city is lost.
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                e.preventDefault();
                addCity();
              }}
              className={inputClass}
            />
            <button type="button" onClick={addCity} disabled={draft.trim() === ''} className={secondaryButton}>
              {t('salesTaxAddCity')}
            </button>
          </div>
          <p className="text-muted-foreground mt-1.5 text-[12.5px]">{t('salesTaxCitiesHelp')}</p>

          {values.cities.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-2">
              {values.cities.map((city) => (
                <li
                  key={city}
                  className="bg-secondary text-ink inline-flex items-center gap-1 rounded-full py-1 pr-1.5 pl-3 text-[13px] font-medium"
                >
                  {city}
                  <button
                    type="button"
                    aria-label={t('salesTaxRemoveCity', { city })}
                    onClick={() => onChange({ ...values, cities: values.cities.filter((name) => name !== city) })}
                    className="text-muted-foreground hover:text-ink inline-flex size-5 items-center justify-center rounded-full"
                  >
                    <X className="size-3.5" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
