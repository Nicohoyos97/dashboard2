'use client';

// The account control in the top bar, beside Help: a circle carrying the
// business's own logo, cropped to fill it edge to edge rather than sitting
// letterboxed inside it. It opens the same menu as the user row at the bottom of
// the sidebar — Profile and Sign out — so the two are never a different set of
// choices depending on where you clicked.
import { DropdownMenu } from 'radix-ui';

import { AccountMenuItems, useSignOutForm } from './account-menu';
import { AccountTrigger } from './menu-triggers';

export function TopAccountMenuLoaded({
  businessName,
  logoUrl,
  profileHref,
  defaultOpen = false,
}: {
  businessName: string;
  logoUrl: string | null;
  profileHref: string;
  defaultOpen?: boolean;
}) {
  const signOutForm = useSignOutForm();

  return (
    <>
      {signOutForm.element}
      <DropdownMenu.Root defaultOpen={defaultOpen}>
        <DropdownMenu.Trigger asChild>
          <AccountTrigger businessName={businessName} logoUrl={logoUrl} />
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            side="bottom"
            align="end"
            sideOffset={8}
            className="border-line bg-card z-50 min-w-[208px] rounded-xl border p-1.5 shadow-menu"
          >
            <p className="text-muted-foreground truncate px-2.5 pt-1 pb-2 text-small">
              {businessName}
            </p>
            <AccountMenuItems profileHref={profileHref} onSignOut={signOutForm.submit} />
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </>
  );
}
