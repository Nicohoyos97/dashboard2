// Settings → Notifications (INITIAL_PROMPT.md §7). Preferences are per user and
// per business, so they are read for the entity resolved from the session; a
// user with no membership yet sees the pending state instead of a dead form.
import { getTranslations } from 'next-intl/server';

import { NotificationForm } from '@/components/settings/NotificationForm';
import { getCurrentEntity } from '@/lib/auth/getCurrentEntity';
import { DEFAULT_NOTIFICATION_PREFERENCES, type NotificationPreferences } from '@/lib/settings/types';
import { createClient } from '@/lib/supabase/server';

export default async function NotificationsPage() {
  const [t, entity] = await Promise.all([getTranslations('Settings'), getCurrentEntity()]);

  if (!entity) {
    return (
      <section className="max-w-[560px]">
        <Heading eyebrow={t('notifyEyebrow')} title={t('navNotifications')} lede={t('notifyLede')} />
        <p className="text-muted-foreground mt-6 text-[14px]">{t('notifyNoBusiness')}</p>
      </section>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data } = user
    ? await supabase
        .from('notification_preferences')
        .select('reminders, new_reports, tax_deadlines, document_activity, email_digest')
        .eq('user_id', user.id)
        .eq('business_entity_id', entity.id)
        .maybeSingle()
    : { data: null };

  const initial: NotificationPreferences = data ?? DEFAULT_NOTIFICATION_PREFERENCES;

  return (
    <section className="max-w-[560px]">
      <Heading eyebrow={t('notifyEyebrow')} title={t('navNotifications')} lede={t('notifyLede')} />
      <NotificationForm businessName={entity.name} canEdit={entity.role !== 'firm_preview'} initial={initial} />
    </section>
  );
}

function Heading({ eyebrow, title, lede }: { eyebrow: string; title: string; lede: string }) {
  return (
    <>
      <p className="text-muted-foreground text-[11px] font-semibold tracking-[0.12em] uppercase">{eyebrow}</p>
      <h1 className="text-ink mt-1 text-[22px] font-bold tracking-[-0.01em]">{title}</h1>
      <p className="text-muted-foreground mt-1.5 text-[14px]">{lede}</p>
    </>
  );
}
