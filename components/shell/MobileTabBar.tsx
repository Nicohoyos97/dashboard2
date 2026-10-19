'use client';

// The phone's primary navigation: the sections the owner moves between, one
// thumb away, instead of behind the menu button. The drawer keeps everything
// else — Settings, Help, the business switcher, the user. Below `md` only;
// from `md` up the sidebar does this job.
//
// Built from the same filtered nav the sidebar renders, so a section the firm
// did not sell is absent here too: Statements opens on its first page, and
// Taxes is whichever of Income or Sales the business has (Income first), lit
// on either.
import { FileText, Landmark, LayoutDashboard, type LucideIcon, Receipt, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Link, usePathname } from '@/i18n/navigation';
import { type NavItem, isActiveNav } from '@/lib/nav';

type Tab = { href: string; match: string; labelKey: string; icon: LucideIcon };

export function tabsFor(items: readonly NavItem[]): Tab[] {
  const has = (href: string) => items.find((item) => item.href === href);
  const tabs: Tab[] = [{ href: '/dashboard', match: '/dashboard', labelKey: 'overview', icon: LayoutDashboard }];
  const statements = has('/statements');
  const firstStatement = statements?.children?.find((child) => !child.disabled);
  if (firstStatement) tabs.push({ href: firstStatement.href, match: '/statements', labelKey: 'tabStatements', icon: FileText });
  if (has('/expenses')) tabs.push({ href: '/expenses', match: '/expenses', labelKey: 'expenses', icon: Receipt });
  const taxes = has('/taxes/income') ?? has('/taxes/sales');
  if (taxes) tabs.push({ href: taxes.href, match: '/taxes', labelKey: 'tabTaxes', icon: Landmark });
  if (has('/chat')) tabs.push({ href: '/chat', match: '/chat', labelKey: 'tabNick', icon: Sparkles });
  return tabs;
}

export function MobileTabBar({ items }: { items: readonly NavItem[] }) {
  const t = useTranslations('Nav');
  const tShell = useTranslations('Shell');
  const pathname = usePathname();
  const tabs = tabsFor(items);

  return (
    <nav
      aria-label={tShell('tabBar')}
      className="border-line bg-card fixed inset-x-0 bottom-0 z-30 border-t pb-[env(safe-area-inset-bottom)] md:hidden print:hidden"
    >
      <ul className="mx-auto flex max-w-[560px]">
        {tabs.map((tab) => {
          const active = isActiveNav(pathname, tab.match);
          const Icon = tab.icon;
          return (
            <li key={tab.href} className="min-w-0 flex-1">
              <Link
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                className={`focus-visible:ring-brand/40 flex h-[3.75rem] flex-col items-center justify-center gap-1 outline-none focus-visible:ring-3 focus-visible:ring-inset ${
                  active ? 'text-link' : 'text-muted-foreground hover:text-ink'
                }`}
              >
                <span
                  className={`flex h-7 w-12 items-center justify-center rounded-full transition-colors motion-reduce:transition-none ${active ? 'bg-blue-pale' : ''}`}
                >
                  <Icon className="size-5" strokeWidth={active ? 2 : 1.75} aria-hidden="true" />
                </span>
                <span className={`max-w-full truncate px-1 text-caption leading-none ${active ? 'font-semibold' : 'font-medium'}`}>
                  {t(tab.labelKey)}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
