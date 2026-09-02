// Settings → Profile: update name + avatar. The (dashboard) layout already
// guards the session; we read the current profile for the initial form values.
import { getTranslations } from 'next-intl/server';

import { ProfileForm } from '@/components/settings/ProfileForm';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { createClient } from '@/lib/supabase/server';

export default async function ProfilePage() {
  const t = await getTranslations('Settings');
  const user = await getCurrentUser();
  const supabase = await createClient();
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, avatar_url')
    .eq('id', user!.id)
    .maybeSingle();

  return (
    <section className="max-w-[560px]">
      <p className="text-muted-foreground text-[11px] font-semibold tracking-[0.12em] uppercase">
        {t('profileEyebrow')}
      </p>
      <h2 className="text-ink mt-2 text-[22px] font-bold tracking-[-0.01em]">
        {t('profileTitle')}
      </h2>
      <p className="text-muted-foreground mt-1.5 text-[15px]">{t('profileLede')}</p>

      <ProfileForm
        userId={user!.id}
        initialName={profile?.full_name ?? ''}
        initialAvatarUrl={profile?.avatar_url ?? null}
      />
    </section>
  );
}
