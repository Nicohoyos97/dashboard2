import { getTranslations } from 'next-intl/server';

import { EntitySwitcher } from '@/components/shell/lazy-menus';
import { NavList } from '@/components/shell/NavList';
import { type ShellUser, UserBlock } from '@/components/shell/UserBlock';
import type { CurrentEntity } from '@/lib/auth/getCurrentEntity';
import { BOTTOM_NAV_ITEMS, type NavItem } from '@/lib/nav';
import { initials } from '@/lib/utils/initials';

// Client-portal sidebar body (INITIAL_PROMPT.md §7): the business whose books
// these are, directly under the logo — the way a workspace sits at the top of
// any tool the owner already uses — then the nav, then Settings, Help and the
// user at the foot. Rendered by AppShell both in the desktop aside and in the
// mobile drawer.
export async function Sidebar({
  navItems,
  entities,
  currentEntity,
  logoUrl,
  user,
}: {
  navItems: NavItem[];
  entities: CurrentEntity[];
  currentEntity: CurrentEntity | null;
  logoUrl: string | null;
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
      {currentEntity && entities.length > 1 && (
        <div className="mt-5">
          <EntitySwitcher entities={entities} currentId={currentEntity.id} />
        </div>
      )}
      {currentEntity && entities.length === 1 && (
        <div className="border-line mt-5 flex items-center gap-2.5 rounded-xl border px-2.5 py-2">
          <span className="border-line bg-secondary flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-lg border">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- firm-set, arbitrary host
              <img src={logoUrl} alt="" className="size-full object-cover" />
            ) : (
              <span className="text-muted-foreground text-micro font-semibold" aria-hidden="true">
                {initials(currentEntity.name)}
              </span>
            )}
          </span>
          <span className="min-w-0">
            <span className="text-muted-foreground block text-micro font-medium">{t('business')}</span>
            <span className="text-ink block truncate text-small font-semibold">{currentEntity.name}</span>
          </span>
        </div>
      )}

      <NavList items={navItems} namespace="Nav" />

      <UserBlock
        user={user}
        roleLabel={roleLabel}
        profileHref="/settings/profile"
        links={BOTTOM_NAV_ITEMS}
        namespace="Nav"
      />
    </>
  );
}
