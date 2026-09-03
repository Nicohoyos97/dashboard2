'use client';

// Desktop top bar (INITIAL_PROMPT.md §6 header): search on the left, then
// notifications, theme toggle and Help on the right. Page-level actions
// (period, downloads) stay in each page's own header. On phones AppShell's
// compact bar takes over.
import { CircleHelp } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Link } from '@/i18n/navigation';
import type { NavItem } from '@/lib/nav';
import type { PortalNotification } from '@/lib/portal/notifications';

import { ThemeToggle } from '../theme/ThemeToggle';
import { NotificationBell } from './NotificationBell';
import { SearchBar, type SearchTarget } from './SearchBar';

const iconButton =
  'text-muted-foreground hover:bg-secondary hover:text-ink focus-visible:ring-blue/40 inline-flex size-10 items-center justify-center rounded-xl transition outline-none focus-visible:ring-3';

export function TopBar({
  items,
  namespace,
  askNick,
  helpHref,
  notifications,
}: {
  items: NavItem[];
  namespace: 'Nav' | 'Admin';
  askNick: boolean;
  helpHref: string | null;
  notifications?: PortalNotification[];
}) {
  const t = useTranslations(namespace);
  const tShell = useTranslations('Shell');
  const targets: SearchTarget[] = items.flatMap((item) => {
    if (item.children)
      return item.children
        .filter((child) => !child.disabled)
        .map((child) => ({ href: child.href, label: t(child.labelKey) }));
    return item.disabled ? [] : [{ href: item.href, label: t(item.labelKey) }];
  });

  return (
    <div
      role="toolbar"
      aria-label={tShell('topBar')}
      className="border-line/80 bg-card/80 sticky top-0 z-20 hidden h-16 items-center gap-3 border-b px-6 backdrop-blur-sm md:flex"
    >
      <SearchBar targets={targets} askNick={askNick} />
      <div className="ml-auto flex items-center gap-1">
        {notifications && <NotificationBell notifications={notifications} />}
        <ThemeToggle variant="icon" />
        {helpHref && (
          <Link
            href={helpHref}
            aria-label={tShell('help')}
            title={tShell('help')}
            className={iconButton}
          >
            <CircleHelp className="size-[18px]" strokeWidth={1.75} aria-hidden="true" />
          </Link>
        )}
      </div>
    </div>
  );
}
