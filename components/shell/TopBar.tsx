'use client';

// Desktop top bar (INITIAL_PROMPT.md §6 header): the name of the page you are
// on sits on the left where the sidebar's highlight leaves off, and the search
// sits on the right beside the notification, theme and Help controls. Page
// actions (period, downloads) stay in each page's own header. On phones
// AppShell's compact bar takes over.
import { ChevronRight, CircleHelp } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Link, usePathname } from '@/i18n/navigation';
import { type NavItem, breadcrumbFor } from '@/lib/nav';
import type { PortalNotification } from '@/lib/portal/notifications';

import { ThemeToggle } from '../theme/ThemeToggle';
import { NotificationBell } from './NotificationBell';
import { SearchBar, type SearchTarget } from './SearchBar';
import { TopAccountMenu } from './TopAccountMenu';

const iconButton =
  'text-muted-foreground hover:bg-secondary hover:text-ink focus-visible:ring-blue/40 inline-flex size-10 items-center justify-center rounded-xl transition outline-none focus-visible:ring-3';

export function TopBar({
  items,
  namespace,
  askNick,
  helpHref,
  notifications,
  account,
}: {
  items: NavItem[];
  namespace: 'Nav' | 'Admin';
  askNick: boolean;
  helpHref: string | null;
  notifications?: PortalNotification[];
  /** The business whose portal this is; absent in the firm portal. */
  account?: { businessName: string; logoUrl: string | null; profileHref: string };
}) {
  const t = useTranslations(namespace);
  const tShell = useTranslations('Shell');
  const pathname = usePathname();
  const targets: SearchTarget[] = items.flatMap((item) => {
    if (item.children)
      return item.children
        .filter((child) => !child.disabled)
        .map((child) => ({ href: child.href, label: t(child.labelKey) }));
    return item.disabled ? [] : [{ href: item.href, label: t(item.labelKey) }];
  });
  // Where you are, as a trail rather than a single word: the sidebar highlight
  // shows the section, the trail shows the path through it.
  const crumbs = breadcrumbFor(pathname, items);

  return (
    <div
      role="toolbar"
      aria-label={tShell('topBar')}
      className="border-line/80 bg-card/80 sticky top-0 z-20 hidden h-16 items-center gap-3 border-b px-6 backdrop-blur-sm md:flex"
    >
      <nav aria-label={tShell('breadcrumb')} className="min-w-0">
        <ol className="flex min-w-0 items-center gap-1.5 text-[15px]">
          {crumbs.map((crumb, index) => {
            const last = index === crumbs.length - 1;
            return (
              <li key={`${crumb.labelKey}-${index}`} className="flex min-w-0 items-center gap-1.5">
                {index > 0 && (
                  <ChevronRight
                    className="text-muted-foreground/60 size-3.5 shrink-0"
                    strokeWidth={2}
                    aria-hidden="true"
                  />
                )}
                {crumb.href && !last ? (
                  <Link
                    href={crumb.href}
                    className="text-muted-foreground hover:text-ink truncate transition"
                  >
                    {t(crumb.labelKey)}
                  </Link>
                ) : (
                  <span
                    className={last ? 'text-ink truncate font-semibold' : 'text-muted-foreground truncate'}
                    {...(last ? { 'aria-current': 'page' as const } : {})}
                  >
                    {t(crumb.labelKey)}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </nav>
      <div className="ml-auto flex items-center gap-1">
        <div className="w-[min(300px,28vw)]">
          <SearchBar targets={targets} askNick={askNick} />
        </div>
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
        {account && (
          <TopAccountMenu
            businessName={account.businessName}
            logoUrl={account.logoUrl}
            profileHref={account.profileHref}
          />
        )}
      </div>
    </div>
  );
}
