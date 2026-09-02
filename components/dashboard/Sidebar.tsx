import { getTranslations } from 'next-intl/server';

import { EntitySwitcher } from '@/components/shell/EntitySwitcher';
import { NavList } from '@/components/shell/NavList';
import { type ShellUser, UserBlock } from '@/components/shell/UserBlock';
import type { CurrentEntity } from '@/lib/auth/getCurrentEntity';
import { NAV_ITEMS } from '@/lib/nav';

// Client-portal sidebar body (INITIAL_PROMPT.md §7): nav, then the selected
// business (a switcher when the user belongs to several), then the user.
// Rendered by AppShell both in the desktop aside and in the mobile drawer.
export async function Sidebar({
  entities,
  currentEntity,
  user,
}: {
  entities: CurrentEntity[];
  currentEntity: CurrentEntity | null;
  user: ShellUser;
}) {
  const t = await getTranslations('Shell');
  const roleLabel =
    currentEntity?.role === 'client_owner'
      ? t('roleOwner')
      : currentEntity?.role === 'client_viewer'
        ? t('roleViewer')
        : '';

  return (
    <>
      <NavList items={NAV_ITEMS} namespace="Nav" />

      {currentEntity && entities.length > 1 && (
        <div className="mt-3">
          <EntitySwitcher entities={entities} currentId={currentEntity.id} />
        </div>
      )}
      {currentEntity && entities.length === 1 && (
        <div className="bg-secondary mt-3 rounded-xl px-3 py-2">
          <p className="text-muted-foreground text-[11px] font-medium">{t('business')}</p>
          <p className="text-ink truncate text-[13.5px] font-semibold">{currentEntity.name}</p>
        </div>
      )}

      <UserBlock user={user} roleLabel={roleLabel} profileHref="/settings/profile" />
    </>
  );
}
