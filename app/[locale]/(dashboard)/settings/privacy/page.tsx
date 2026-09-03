// Settings → Data & privacy (INITIAL_PROMPT.md §7). Both actions are requests
// queued for the firm: the portal never exports or deletes on its own, because
// the firm has retention obligations the client cannot override.
import { getFormatter, getTranslations } from 'next-intl/server';

import { AccountRequests, type AccountRequestRow } from '@/components/settings/AccountRequests';
import { getCurrentEntity } from '@/lib/auth/getCurrentEntity';
import { ACCOUNT_REQUEST_KINDS, type AccountRequestKind } from '@/lib/settings/types';
import { createClient } from '@/lib/supabase/server';

export default async function PrivacyPage() {
  const [t, format, entity] = await Promise.all([getTranslations('Settings'), getFormatter(), getCurrentEntity()]);

  if (!entity) {
    return (
      <section className="max-w-[640px]">
        <Heading eyebrow={t('privacyEyebrow')} title={t('navPrivacy')} lede={t('privacyLede')} />
        <p className="text-muted-foreground mt-6 text-[14px]">{t('notifyNoBusiness')}</p>
      </section>
    );
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from('account_requests')
    .select('id, kind, status, message, firm_note, requested_at')
    .eq('business_entity_id', entity.id)
    .order('requested_at', { ascending: false })
    .limit(50);

  const kindOf = (value: string): AccountRequestKind => (value === 'account_deletion' ? 'account_deletion' : 'data_export');
  const requests: AccountRequestRow[] = (data ?? []).map((row) => ({
    id: row.id,
    kind: kindOf(row.kind),
    status: row.status,
    message: row.message,
    firmNote: row.firm_note,
    // Formatted here: a Server Component cannot hand a formatter function to a
    // Client Component, and the request list needs no other date arithmetic.
    requestedAt: format.dateTime(new Date(row.requested_at), { dateStyle: 'medium', timeZone: 'UTC' }),
  }));
  const canRequest = entity.role !== 'firm_preview';

  return (
    <section className="max-w-[640px]">
      <Heading eyebrow={t('privacyEyebrow')} title={t('navPrivacy')} lede={t('privacyLede')} />
      {ACCOUNT_REQUEST_KINDS.map((kind) => (
        <AccountRequests key={kind} kind={kind} canRequest={canRequest} requests={requests} />
      ))}
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
