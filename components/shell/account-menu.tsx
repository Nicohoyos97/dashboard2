'use client';

// The account menu's contents, shared by the sidebar's user row and the top
// bar's logo button. Both offer the same two things — Profile and Sign out —
// and keeping one copy is what stops them drifting apart.
import { LogOut, UserRound } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { DropdownMenu } from 'radix-ui';
import { type RefObject, useRef } from 'react';

import { Link } from '@/i18n/navigation';
import { signOut } from '@/lib/auth/actions';

export const menuItemClass =
  'text-ink data-[highlighted]:bg-secondary flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13.5px] outline-none';

export function initials(nameOrEmail: string): string {
  const parts = nameOrEmail.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '·';
  return (parts[0]![0]! + (parts[1]?.[0] ?? '')).toUpperCase();
}

/**
 * The sign-out form has to live outside the menu: selecting an item unmounts
 * the menu, which would drop a form submitted from inside it.
 */
export function useSignOutForm(): {
  form: RefObject<HTMLFormElement | null>;
  element: React.ReactNode;
  submit: () => void;
} {
  const form = useRef<HTMLFormElement>(null);
  return {
    form,
    element: <form ref={form} action={signOut} className="hidden" aria-hidden="true" />,
    submit: () => form.current?.requestSubmit(),
  };
}

export function AccountMenuItems({
  profileHref,
  onSignOut,
}: {
  profileHref: string;
  onSignOut: () => void;
}) {
  const t = useTranslations('Shell');
  return (
    <>
      <DropdownMenu.Item asChild>
        <Link href={profileHref} className={menuItemClass}>
          <UserRound className="size-4" strokeWidth={1.75} aria-hidden="true" />
          {t('profile')}
        </Link>
      </DropdownMenu.Item>
      <DropdownMenu.Separator className="bg-line my-1 h-px" />
      <DropdownMenu.Item
        onSelect={onSignOut}
        className={`${menuItemClass} text-danger data-[highlighted]:bg-danger/10`}
      >
        <LogOut className="size-4" strokeWidth={1.75} aria-hidden="true" />
        {t('signOut')}
      </DropdownMenu.Item>
    </>
  );
}
