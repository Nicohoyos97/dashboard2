'use client';

// The user row at the bottom of the sidebar: avatar, name and role. It is a
// menu button so sign-out stays reachable without a permanent button in the
// sidebar (owner request): Profile, then Sign out.
import { LogOut, UserRound } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { DropdownMenu } from 'radix-ui';
import { useRef } from 'react';

import { Link } from '@/i18n/navigation';
import { signOut } from '@/lib/auth/actions';

export type ShellUser = { name: string; email: string; avatarUrl: string | null };

function initials(nameOrEmail: string): string {
  const parts = nameOrEmail.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '·';
  return (parts[0]![0]! + (parts[1]?.[0] ?? '')).toUpperCase();
}

const menuItem =
  'text-ink data-[highlighted]:bg-secondary flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13.5px] outline-none';

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
  // The sign-out form lives outside the menu: the menu unmounts on select,
  // which would drop a form submitted from inside it.
  const signOutForm = useRef<HTMLFormElement>(null);

  return (
    <>
      <form ref={signOutForm} action={signOut} className="hidden" aria-hidden="true" />
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
            <DropdownMenu.Item asChild>
              <Link href={profileHref} className={menuItem}>
                <UserRound className="size-4" strokeWidth={1.75} aria-hidden="true" />
                {t('profile')}
              </Link>
            </DropdownMenu.Item>
            <DropdownMenu.Separator className="bg-line my-1 h-px" />
            <DropdownMenu.Item
              onSelect={() => signOutForm.current?.requestSubmit()}
              className={`${menuItem} text-danger data-[highlighted]:bg-danger/10`}
            >
              <LogOut className="size-4" strokeWidth={1.75} aria-hidden="true" />
              {t('signOut')}
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </>
  );
}
