// Settings → Members: read-only roster of the current business. The (dashboard)
// layout guards the session; the entity is resolved server-side. Co-member
// profiles are readable via the profiles_comember_select policy. Invites are a
// firm-admin action (INITIAL_PROMPT.md §8), so there is no invite UI here.
import { getTranslations } from 'next-intl/server';

import { getCurrentEntity } from '@/lib/auth/getCurrentEntity';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { createClient } from '@/lib/supabase/server';

const ROLE_ORDER: Record<string, number> = { client_owner: 0, client_viewer: 1 };
const ROLE_KEY: Record<string, string> = {
  client_owner: 'roleOwner',
  client_viewer: 'roleViewer',
};

function initials(nameOrEmail: string): string {
  const parts = nameOrEmail.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '·';
  return (parts[0]![0]! + (parts[1]?.[0] ?? '')).toUpperCase();
}

export default async function MembersPage() {
  const t = await getTranslations('Settings');
  const [entity, user] = await Promise.all([getCurrentEntity(), getCurrentUser()]);

  const supabase = await createClient();
  const { data: memberships } = entity
    ? await supabase
        .from('entity_memberships')
        .select('user_id, role')
        .eq('business_entity_id', entity.id)
    : { data: [] };

  const ids = (memberships ?? []).map((m) => m.user_id);
  const { data: profiles } = ids.length
    ? await supabase.from('profiles').select('id, full_name, email, avatar_url').in('id', ids)
    : { data: [] };

  const byId = new Map((profiles ?? []).map((p) => [p.id, p]));
  const rows = (memberships ?? [])
    .map((m) => ({ ...m, profile: byId.get(m.user_id) ?? null }))
    .sort(
      (a, b) =>
        (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9) ||
        (a.profile?.full_name ?? a.profile?.email ?? '').localeCompare(
          b.profile?.full_name ?? b.profile?.email ?? '',
        ),
    );

  return (
    <section className="max-w-[640px]">
      <p className="text-muted-foreground text-[11px] font-semibold tracking-[0.12em] uppercase">
        {t('membersEyebrow')}
      </p>
      <h2 className="text-ink mt-2 text-[22px] font-bold tracking-[-0.01em]">
        {t('membersTitle')}
      </h2>
      <p className="text-muted-foreground mt-1.5 text-[15px]">{t('membersLede')}</p>

      <ul className="divide-line border-line bg-card mt-6 divide-y overflow-hidden rounded-2xl border shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        {rows.map((m) => {
          const name = m.profile?.full_name?.trim() || m.profile?.email || '—';
          const isSelf = m.user_id === user?.id;
          return (
            <li key={m.user_id} className="flex items-center gap-4 px-5 py-4">
              <div className="border-line bg-secondary relative size-10 shrink-0 overflow-hidden rounded-full border">
                {m.profile?.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element -- user-uploaded, arbitrary host
                  <img src={m.profile.avatar_url} alt="" className="size-full object-cover" />
                ) : (
                  <span className="text-muted-foreground flex size-full items-center justify-center text-[13px] font-bold">
                    {initials(name)}
                  </span>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-ink flex items-center gap-2 truncate text-[15px] font-semibold">
                  {name}
                  {isSelf && (
                    <span className="bg-secondary text-muted-foreground rounded px-1.5 py-0.5 text-[11px] font-medium">
                      {t('youTag')}
                    </span>
                  )}
                </p>
                {m.profile?.email && (
                  <p className="text-muted-foreground truncate text-[13.5px]">{m.profile.email}</p>
                )}
              </div>

              <span className="bg-blue-pale text-blue shrink-0 rounded-full px-2.5 py-1 text-[12.5px] font-semibold">
                {t(ROLE_KEY[m.role] ?? 'roleViewer')}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
