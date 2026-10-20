'use client';

// The user row at the bottom of the sidebar: avatar, name and role. It is a
// menu button so sign-out stays reachable without a permanent button in the
// sidebar (owner request): Profile, then Sign out.
import { DropdownMenu } from 'radix-ui';

import { AccountMenuItems, useSignOutForm } from './account-menu';
import { UserRowTrigger } from './menu-triggers';

export type ShellUser = { name: string; email: string; avatarUrl: string | null };

export function UserMenuLoaded({
  user,
  roleLabel,
  profileHref,
  defaultOpen = false,
}: {
  user: ShellUser;
  roleLabel: string;
  profileHref: string;
  defaultOpen?: boolean;
}) {
  const display = user.name.trim() || user.email;
  const signOutForm = useSignOutForm();

  return (
    <>
      {signOutForm.element}
      <DropdownMenu.Root defaultOpen={defaultOpen}>
        <DropdownMenu.Trigger asChild>
          <UserRowTrigger name={display} avatarUrl={user.avatarUrl} roleLabel={roleLabel} />
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            side="top"
            align="start"
            sideOffset={8}
            className="border-line bg-card z-50 w-[var(--radix-dropdown-menu-trigger-width)] min-w-[208px] rounded-xl border p-1.5 shadow-menu"
          >
            <AccountMenuItems profileHref={profileHref} onSignOut={signOutForm.submit} />
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </>
  );
}
