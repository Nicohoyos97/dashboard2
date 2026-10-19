'use client';

import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';

import { type Address, updateBusinessEntity } from '@/lib/settings/actions';

const inputClass =
  'h-11 w-full rounded-lg border border-line bg-card px-4 text-body text-foreground outline-none transition placeholder:text-muted-foreground/60 focus:border-brand focus:shadow-focus disabled:cursor-not-allowed disabled:bg-secondary disabled:text-muted-foreground';

const ADDRESS_FIELDS: { key: keyof Address; labelKey: string; autoComplete: string }[] = [
  { key: 'line1', labelKey: 'addrLine1Label', autoComplete: 'address-line1' },
  { key: 'line2', labelKey: 'addrLine2Label', autoComplete: 'address-line2' },
  { key: 'city', labelKey: 'addrCityLabel', autoComplete: 'address-level2' },
  { key: 'state', labelKey: 'addrStateLabel', autoComplete: 'address-level1' },
  { key: 'postal_code', labelKey: 'addrPostalLabel', autoComplete: 'postal-code' },
  { key: 'country', labelKey: 'addrCountryLabel', autoComplete: 'country-name' },
];

export function BusinessForm({
  canEdit,
  initialName,
  initialLegalName,
  initialAddress,
}: {
  canEdit: boolean;
  initialName: string;
  initialLegalName: string;
  initialAddress: Address;
}) {
  const t = useTranslations('Settings');

  const [name, setName] = useState(initialName);
  const [legalName, setLegalName] = useState(initialLegalName);
  const [address, setAddress] = useState<Address>(initialAddress);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  function setField(key: keyof Address, value: string) {
    setSaved(false);
    setAddress((prev) => ({ ...prev, [key]: value }));
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canEdit) return;
    setSaved(false);
    setError(null);
    startTransition(async () => {
      const res = await updateBusinessEntity({ name, legalName, address });
      if (!res.ok) return setError(res.error);
      setSaved(true);
    });
  }

  return (
    <form
      onSubmit={onSubmit}
      className="border-line bg-card mt-6 rounded-2xl border p-6 shadow-card"
    >
      {!canEdit && (
        <p
          role="status"
          className="border-line bg-secondary text-muted-foreground mb-6 rounded-lg border px-4 py-3 text-ui"
        >
          {t('bizPermissionBanner')}
        </p>
      )}

      <div className="flex flex-col gap-5">
        <div>
          <label htmlFor="bizName" className="text-ink mb-1.5 block text-ui font-semibold">
            {t('bizNameLabel')}
          </label>
          <input
            id="bizName"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setSaved(false);
            }}
            disabled={!canEdit}
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="legalName" className="text-ink mb-1.5 block text-ui font-semibold">
            {t('bizLegalNameLabel')}
          </label>
          <input
            id="legalName"
            value={legalName}
            onChange={(e) => {
              setLegalName(e.target.value);
              setSaved(false);
            }}
            disabled={!canEdit}
            className={inputClass}
          />
        </div>
      </div>

      <p className="text-muted-foreground mt-7 mb-3 text-micro font-semibold tracking-[0.12em] uppercase">
        {t('addrSection')}
      </p>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        {ADDRESS_FIELDS.map(({ key, labelKey, autoComplete }) => (
          <div key={key} className={key === 'line1' || key === 'line2' ? 'sm:col-span-2' : ''}>
            <label htmlFor={key} className="text-ink mb-1.5 block text-ui font-semibold">
              {t(labelKey)}
            </label>
            <input
              id={key}
              value={address[key]}
              onChange={(e) => setField(key, e.target.value)}
              autoComplete={autoComplete}
              disabled={!canEdit}
              className={inputClass}
            />
          </div>
        ))}
      </div>

      {error && (
        <p role="alert" className="mt-4 text-ui text-danger">
          {error}
        </p>
      )}

      {canEdit && (
        <div className="mt-6 flex items-center justify-end gap-4">
          {saved && <span className="text-success text-ui font-medium">{t('saved')}</span>}
          <button
            type="submit"
            disabled={isPending || name.trim().length === 0}
            className="bg-blue hover:bg-blue-hover inline-flex h-11 items-center justify-center rounded-lg px-5 text-ui font-semibold text-white transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPending ? t('saving') : t('save')}
          </button>
        </div>
      )}
    </form>
  );
}
