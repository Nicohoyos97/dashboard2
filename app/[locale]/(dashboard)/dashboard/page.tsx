// Overview (INITIAL_PROMPT.md §7). At baseline this renders honest states only —
// no placeholder charts or hard-coded numbers (§3 "Product"). Phase 3 replaces
// the body with the real Overview: KPI cards, cash chart, insights, reminders,
// available-report tiles.
import { getTranslations } from 'next-intl/server';

import { getCurrentEntity } from '@/lib/auth/getCurrentEntity';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { createClient } from '@/lib/supabase/server';

export default async function OverviewPage() {
  const t = await getTranslations('Overview');
  const [user, entity] = await Promise.all([getCurrentUser(), getCurrentEntity()]);

  const supabase = await createClient();
  const { data: profile } = user
    ? await supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle()
    : { data: null };
  const firstName = profile?.full_name?.trim().split(/\s+/)[0] ?? '';

  return (
    <main className="mx-auto w-full max-w-[1200px] px-6 py-10 md:px-10">
      <h1 className="text-ink text-[28px] font-bold tracking-[-0.01em]">
        {firstName ? t('greeting', { name: firstName }) : t('greetingAnon')}
      </h1>
      <p className="text-muted-foreground mt-1.5 text-[15px]">
        {entity ? t('subtitle', { business: entity.name }) : t('subtitlePending')}
      </p>

      <section className="border-line bg-card mt-8 rounded-2xl border p-8 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <h2 className="text-ink text-[18px] font-semibold">
          {entity ? t('emptyTitle') : t('pendingTitle')}
        </h2>
        <p className="text-muted-foreground mt-2 max-w-[560px] text-[15px] leading-[1.55]">
          {entity ? t('emptyBody', { business: entity.name }) : t('pendingBody')}
        </p>
      </section>
    </main>
  );
}
