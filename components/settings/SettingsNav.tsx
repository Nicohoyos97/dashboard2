'use client';

import { useTranslations } from 'next-intl';

import { Link, usePathname } from '@/i18n/navigation';

// Settings sub-nav (client portal). Notification preferences, data export and
// account-deletion requests arrive in Phase 5 (INITIAL_PROMPT.md §7).
const ITEMS = [
  { href: '/settings/profile', key: 'navProfile' },
  { href: '/settings/business', key: 'navBusiness' },
  { href: '/settings/members', key: 'navMembers' },
] as const;

export function SettingsNav() {
  const t = useTranslations('Settings');
  const pathname = usePathname(); // locale-stripped by next-intl

  return (
    <nav className="flex shrink-0 gap-1 overflow-x-auto md:w-52 md:flex-col md:overflow-visible">
      {ITEMS.map(({ href, key }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={`rounded-lg px-3 py-2 text-[14px] font-medium transition ${
              active
                ? 'bg-blue-pale text-blue'
                : 'text-muted-foreground hover:bg-secondary hover:text-ink'
            }`}
          >
            {t(key)}
          </Link>
        );
      })}
    </nav>
  );
}
