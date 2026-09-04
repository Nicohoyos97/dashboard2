'use client';

// The user row at the bottom of the sidebar: avatar, name and role. It is a
// menu button so sign-out stays reachable without a permanent button in the
// sidebar (owner request): Profile, then Sign out.
import { useTranslations } from 'next-intl';
import { DropdownMenu } from 'radix-ui';

import { AccountMenuItems, initials, useSignOutForm } from './account-menu';

export type ShellUser = { name: string; email: string; avatarUrl: string | null };

export function UserMenu({
  user,
  roleLabel,
  profileHref,
}: {
  user: ShellUser;
  roleLabel: string;
  profileHref: string;
}) {
  const t = useTranslations('Shell');
  const display = user.name.trim() || user.email;
  const signOutForm = useSignOutForm();

  return (
    <>
      {signOutForm.element}
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            aria-label={t('accountMenu')}
            className="hover:bg-secondary focus-visible:ring-blue/40 flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors outline-none focus-visible:ring-3"
          >
            <span className="border-line bg-secondary relative size-9 shrink-0 overflow-hidden rounded-full border">
              {user.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- user-uploaded, arbitrary host
                <img src={user.avatarUrl} alt="" className="size-full object-cover" />
              ) : (
                <span className="text-muted-foreground flex size-full items-center justify-center text-[12px] font-semibold">
                  {initials(display)}
                </span>
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="text-ink block truncate text-[14px] font-medium">{display}</span>
              <span className="text-muted-foreground block truncate text-[12.5px]">
                {roleLabel}
              </span>
            </span>
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            side="top"
            align="start"
            sideOffset={8}
            className="border-line bg-card z-50 w-[var(--radix-dropdown-menu-trigger-width)] min-w-[208px] rounded-xl border p-1.5 shadow-[0_8px_24px_rgba(15,23,42,0.12)]"
          >
            <AccountMenuItems profileHref={profileHref} onSignOut={signOutForm.submit} />
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </>
  );
}
