import type { NavItem } from '@/lib/nav';

import { NavList } from './NavList';
import { UserMenu } from './lazy-menus';
import type { ShellUser } from './UserMenu';

export type { ShellUser } from './UserMenu';

// Bottom of the sidebar (INITIAL_PROMPT.md §7, DESIGN.md → Navigation): the
// utility links — Settings and Help & support on the client side — then a
// hairline and the user (menu with Profile and Sign out), last, where every
// tool the owner already uses keeps it.
export function UserBlock({
  user,
  roleLabel,
  profileHref,
  links = [],
  namespace = 'Nav',
}: {
  user: ShellUser;
  roleLabel: string;
  profileHref: string;
  links?: NavItem[];
  namespace?: 'Nav' | 'Admin';
}) {
  return (
    <div className="mt-auto pt-8">
      {links.length > 0 && <NavList items={links} namespace={namespace} variant="utility" />}
      <div className="border-line/70 mt-3 border-t" aria-hidden="true" />
      <div className="mt-3">
        <UserMenu user={user} roleLabel={roleLabel} profileHref={profileHref} />
      </div>
    </div>
  );
}
