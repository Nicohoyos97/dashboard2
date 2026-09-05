'use client';

// The client half of the provisioning form, and the invitation that goes with
// it. Split out of ClientDialog so the dialog itself stays about the flow.
import { useTranslations } from 'next-intl';

import type { ClientInput } from '@/lib/firm/clients';
import type { MemberRole } from '@/lib/firm/schemas';
import { routing } from '@/i18n/routing';

import { inputClass, labelClass, selectClass, textareaClass } from './ui';

export type InviteValues = {
  email: string;
  fullName: string;
  role: MemberRole;
  locale: (typeof routing.locales)[number];
};

// Native names, not translated ones: a language picker that reads "Spanish" to
// someone who only speaks Spanish is the one label that must never be i18n'd.
const LANGUAGE_NAMES: Record<string, string> = { en: 'English', es: 'Español' };

export function ClientFields({
  values,
  onChange,
}: {
  values: ClientInput;
  onChange: (values: ClientInput) => void;
}) {
  const t = useTranslations('Admin');
  const set = <K extends keyof ClientInput>(key: K, value: ClientInput[K]) =>
    onChange({ ...values, [key]: value });

  return (
    <>
      <div>
        <label htmlFor="clientName" className={labelClass}>
          {t('clientName')}
        </label>
        <input
          id="clientName"
          required
          value={values.name}
          onChange={(e) => set('name', e.target.value)}
          className={inputClass}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="contactName" className={labelClass}>
            {t('contactName')}
          </label>
          <input
            id="contactName"
            value={values.contactName}
            onChange={(e) => set('contactName', e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="contactEmail" className={labelClass}>
            {t('contactEmail')}
          </label>
          <input
            id="contactEmail"
            type="email"
            value={values.contactEmail}
            onChange={(e) => set('contactEmail', e.target.value)}
            className={inputClass}
          />
        </div>
      </div>
      <div>
        <label htmlFor="clientNotes" className={labelClass}>
          {t('notesInternal')}
        </label>
        <textarea
          id="clientNotes"
          rows={3}
          value={values.notes}
          onChange={(e) => set('notes', e.target.value)}
          className={textareaClass}
        />
      </div>
    </>
  );
}

/**
 * Who gets in, and in what language. Leaving the address empty creates the
 * client and the business without an account — the firm invites later from the
 * business page — so the field is optional rather than the flow being blocked
 * on knowing the owner's email on day one.
 */
export function InviteFields({
  values,
  onChange,
}: {
  values: InviteValues;
  onChange: (values: InviteValues) => void;
}) {
  const t = useTranslations('Admin');
  const set = <K extends keyof InviteValues>(key: K, value: InviteValues[K]) =>
    onChange({ ...values, [key]: value });

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label htmlFor="inviteEmail" className={labelClass}>
          {t('inviteEmail')}
        </label>
        <input
          id="inviteEmail"
          type="email"
          value={values.email}
          onChange={(e) => set('email', e.target.value)}
          className={inputClass}
        />
        <p className="text-muted-foreground mt-1.5 text-[12.5px]">{t('inviteEmailHelp')}</p>
      </div>
      <div>
        <label htmlFor="inviteName" className={labelClass}>
          {t('inviteName')}
        </label>
        <input
          id="inviteName"
          value={values.fullName}
          onChange={(e) => set('fullName', e.target.value)}
          className={inputClass}
        />
      </div>
      <div>
        <label htmlFor="inviteRole" className={labelClass}>
          {t('memberRole')}
        </label>
        <select
          id="inviteRole"
          value={values.role}
          onChange={(e) => set('role', e.target.value === 'client_viewer' ? 'client_viewer' : 'client_owner')}
          className={selectClass}
        >
          <option value="client_owner">{t('roleOwner')}</option>
          <option value="client_viewer">{t('roleViewer')}</option>
        </select>
      </div>
      <div className="sm:col-span-2">
        <label htmlFor="inviteLocale" className={labelClass}>
          {t('clientLanguage')}
        </label>
        <select
          id="inviteLocale"
          value={values.locale}
          onChange={(e) => set('locale', e.target.value as InviteValues['locale'])}
          className={selectClass}
        >
          {routing.locales.map((locale) => (
            <option key={locale} value={locale}>
              {LANGUAGE_NAMES[locale] ?? locale}
            </option>
          ))}
        </select>
        <p className="text-muted-foreground mt-1.5 text-[12.5px]">{t('clientLanguageHelp')}</p>
      </div>
    </div>
  );
}
