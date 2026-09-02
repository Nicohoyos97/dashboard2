'use client';

// Top-level nav for the app shell. Client-only because it reads the current path to
// highlight the active item. "Reports" is an always-expanded parent: its children
// render indented below it, with the active statement highlighted. Disabled items
// ("Assistant" — Phase 6; the coming-soon reports) render non-interactive (no Link).
// Links use the locale-aware next-intl Link so navigation preserves the active locale.
import { useTranslations } from 'next-intl';

import { Link, usePathname } from '@/i18n/navigation';
import { NAV_ITEMS, type NavChild, isActiveNav } from '@/lib/nav';

const itemBase = 'rounded-[10px] px-3 py-2 text-[14px]';

export function SidebarNav() {
  const t = useTranslations('Nav');
  const pathname = usePathname();

  return (
    <nav className="flex flex-1 flex-col gap-1">
      {NAV_ITEMS.map((item) => {
        if (item.children) {
          const groupActive = isActiveNav(pathname, item.href);
          return (
            <div key={item.href} className="flex flex-col gap-1">
              <span
                className={`${itemBase} font-semibold ${
                  groupActive ? 'text-blue' : 'text-foreground'
                }`}
              >
                {t(item.labelKey)}
              </span>
              <div className="border-border ml-3 flex flex-col gap-0.5 border-l pl-2">
                {item.children.map((child) => (
                  <NavSubItem
                    key={child.href}
                    child={child}
                    pathname={pathname}
                    label={t(child.labelKey)}
                  />
                ))}
              </div>
            </div>
          );
        }

        if (item.disabled) {
          return (
            <span
              key={item.href}
              aria-disabled="true"
              className={`${itemBase} text-muted-foreground/50 cursor-default font-medium`}
            >
              {t(item.labelKey)}
            </span>
          );
        }

        const active = isActiveNav(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={
              active
                ? `${itemBase} bg-accent text-blue font-semibold`
                : `${itemBase} text-foreground hover:bg-secondary font-medium transition`
            }
          >
            {t(item.labelKey)}
          </Link>
        );
      })}
    </nav>
  );
}

function NavSubItem({
  child,
  pathname,
  label,
}: {
  child: NavChild;
  pathname: string;
  label: string;
}) {
  const subBase = 'rounded-[8px] px-3 py-1.5 text-[13.5px]';

  if (child.disabled) {
    return (
      <span aria-disabled="true" className={`${subBase} text-muted-foreground/50 cursor-default`}>
        {label}
      </span>
    );
  }

  const active = isActiveNav(pathname, child.href);
  return (
    <Link
      href={child.href}
      aria-current={active ? 'page' : undefined}
      className={
        active
          ? `${subBase} text-blue font-semibold`
          : `${subBase} text-foreground hover:bg-secondary font-medium transition`
      }
    >
      {label}
    </Link>
  );
}
