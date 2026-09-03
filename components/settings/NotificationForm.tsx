'use client';

import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';

import { primaryButton } from '@/components/admin/ui';
import { updateNotificationPreferences } from '@/lib/settings/preferences';
import { NOTIFICATION_CHANNELS, type NotificationPreferences } from '@/lib/settings/types';

// Notification preferences (§7 Settings). Preferences are per business, so the
// heading says which one — switching the entity switcher shows that business's
// own settings rather than silently editing another's.
export function NotificationForm({
  businessName,
  canEdit,
  initial,
}: {
  businessName: string;
  canEdit: boolean;
  initial: NotificationPreferences;
}) {
  const t = useTranslations('Settings');
  const [values, setValues] = useState<NotificationPreferences>(initial);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  const toggle = (channel: keyof NotificationPreferences) => {
    setSaved(false);
    setValues((previous) => ({ ...previous, [channel]: !previous[channel] }));
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (!canEdit) return;
        setSaved(false);
        setError(null);
        startTransition(async () => {
          const result = await updateNotificationPreferences(values);
          if (!result.ok) return setError(result.error);
          setSaved(true);
        });
      }}
      className="border-line bg-card mt-6 rounded-2xl border p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
    >
      <p className="text-muted-foreground text-[13px]">{t('notifyForBusiness', { business: businessName })}</p>

      <ul className="mt-4 flex flex-col gap-1">
        {NOTIFICATION_CHANNELS.map((channel) => (
          <li key={channel}>
            <label className="hover:bg-secondary/60 flex cursor-pointer items-start gap-3 rounded-xl px-3 py-3 transition">
              <input
                type="checkbox"
                checked={values[channel]}
                disabled={!canEdit || isPending}
                onChange={() => toggle(channel)}
                className="accent-blue mt-0.5 size-4 shrink-0"
              />
              <span className="min-w-0">
                <span className="text-ink block text-[14px] font-semibold">{t(`notify_${channel}`)}</span>
                <span className="text-muted-foreground block text-[13px] leading-[1.45]">{t(`notify_${channel}_help`)}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>

      {error && <p className="text-danger mt-4 text-[13.5px]">{error}</p>}
      {saved && <p className="text-success mt-4 text-[13.5px]">{t('saved')}</p>}

      <div className="mt-6">
        <button type="submit" disabled={!canEdit || isPending} className={primaryButton}>
          {isPending ? t('saving') : t('save')}
        </button>
      </div>
    </form>
  );
}
