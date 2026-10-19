'use client';

import { useTranslations } from 'next-intl';

import { Link, usePathname } from '@/i18n/navigation';

// Settings sub-nav (client portal), per INITIAL_PROMPT.md §7.
const ITEMS = [
  { href: '/settings/profile', key: 'navProfile' },
  { href: '/settings/business', key: 'navBusiness' },
  { href: '/settings/members', key: 'navMembers' },
  { href: '/settings/notifications', key: 'navNotifications' },
  { href: '/settings/privacy', key: 'navPrivacy' },
] as const;

export function SettingsNav() {
  const t = useTranslations('Settings');
  const pathname = usePathname(); // locale-stripped by next-intl

  return (
    <nav className="-mx-4 flex shrink-0 gap-1 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0 md:w-52 md:flex-col md:overflow-visible">
      {ITEMS.map(({ href, key }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={`focus-visible:ring-brand/40 shrink-0 rounded-lg px-3 py-2 text-ui whitespace-nowrap transition outline-none focus-visible:ring-3 ${
              active
                ? 'bg-blue-pale text-link font-semibold'
                : 'text-muted-foreground hover:bg-secondary hover:text-ink font-medium'
            }`}
          >
            {t(key)}
          </Link>
        );
      })}
    </nav>
  );
}
