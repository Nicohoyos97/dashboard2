'use client';

// The account control in the top bar, beside Help: a circle carrying the
// business's own logo, cropped to fill it edge to edge rather than sitting
// letterboxed inside it. It opens the same menu as the user row at the bottom of
// the sidebar — Profile and Sign out — so the two are never a different set of
// choices depending on where you clicked.
import { useTranslations } from 'next-intl';
import { DropdownMenu } from 'radix-ui';

import { AccountMenuItems, initials, useSignOutForm } from './account-menu';

export function TopAccountMenu({
  businessName,
  logoUrl,
  profileHref,
}: {
  businessName: string;
  logoUrl: string | null;
  profileHref: string;
}) {
  const t = useTranslations('Shell');
  const signOutForm = useSignOutForm();

  return (
    <>
      {signOutForm.element}
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            aria-label={t('accountMenu')}
            title={businessName}
            className="border-line bg-secondary hover:border-brand/40 focus-visible:ring-brand/40 ml-1 inline-flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full border transition outline-none focus-visible:ring-3"
          >
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- firm-set, arbitrary host
              <img src={logoUrl} alt="" className="size-full object-cover" />
            ) : (
              <span className="text-muted-foreground text-caption font-semibold">
                {initials(businessName)}
              </span>
            )}
          </button>
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
