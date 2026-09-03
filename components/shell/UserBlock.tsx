import type { NavItem } from '@/lib/nav';

import { NavList } from './NavList';
import { type ShellUser, UserMenu } from './UserMenu';

export type { ShellUser } from './UserMenu';

// Bottom of the sidebar (INITIAL_PROMPT.md §7, DESIGN.md → Navigation): a
// hairline after generous space, the user (menu with Profile and Sign out),
// then the utility links — Settings and Help & support on the client side.
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
    <div className="mt-auto pt-10">
      <div className="border-line/70 border-t" aria-hidden="true" />
      <div className="mt-4">
        <UserMenu user={user} roleLabel={roleLabel} profileHref={profileHref} />
      </div>
      {links.length > 0 && <NavList items={links} namespace={namespace} variant="utility" />}
    </div>
  );
}
