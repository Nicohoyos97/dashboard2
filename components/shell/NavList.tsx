'use client';

// Sidebar navigation for both portals. Client-only because it reads the
// current path to highlight the active item (rounded soft-blue pill, §6).
// Items with `children` render as an always-expanded group; disabled items
// render non-interactive with a "coming soon" tag — never a dead link.
import {
  FileText,
  FolderOpen,
  Landmark,
  LayoutDashboard,
  type LucideIcon,
  Percent,
  Receipt,
  Settings,
  ShieldCheck,
  Sparkles,
  Upload,
  Users,
} from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Link, usePathname } from '@/i18n/navigation';
import { type NavChild, type NavItem, isActiveNav } from '@/lib/nav';

// Keyed by labelKey so lib/nav.ts stays framework-free.
const ICONS: Record<string, LucideIcon> = {
  overview: LayoutDashboard,
  statements: FileText,
  expenses: Receipt,
  incomeTaxes: Landmark,
  salesTaxes: Percent,
  nick: Sparkles,
  settings: Settings,
  navDashboard: LayoutDashboard,
  navClients: Users,
  navUpload: Upload,
  navDocuments: FolderOpen,
  navAudit: ShieldCheck,
};

const itemBase =
  'flex items-center gap-3 rounded-[10px] px-3 py-2 text-[14px] transition outline-none focus-visible:ring-3 focus-visible:ring-blue/40';

export function NavList({ items, namespace }: { items: NavItem[]; namespace: 'Nav' | 'Admin' }) {
  const t = useTranslations(namespace);
  const tShell = useTranslations('Shell');
  const pathname = usePathname();

  return (
    <nav className="mt-6 flex flex-1 flex-col gap-1">
      {items.map((item) => {
        const Icon = ICONS[item.labelKey];
        const icon = Icon ? <Icon className="size-[18px] shrink-0" aria-hidden="true" /> : null;

        if (item.children) {
          const groupActive = isActiveNav(pathname, item.href);
          return (
            <div key={item.href} className="flex flex-col gap-0.5">
              <span
                className={`${itemBase} font-semibold ${groupActive ? 'text-blue' : 'text-foreground'}`}
              >
                {icon}
                <span className="min-w-0 flex-1 truncate">{t(item.labelKey)}</span>
              </span>
              <div className="ml-[22px] flex flex-col gap-0.5 border-l border-line pl-3">
                {item.children.map((child) => (
                  <NavSubItem
                    key={child.href}
                    child={child}
                    pathname={pathname}
                    label={t(child.labelKey)}
                    soon={tShell('comingSoon')}
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
              className={`${itemBase} text-muted-foreground/60 cursor-default font-medium`}
            >
              {icon}
              <span className="min-w-0 flex-1 truncate">{t(item.labelKey)}</span>
              <SoonTag label={tShell('comingSoon')} />
            </span>
          );
        }

        const active = isActiveNav(pathname, item.href, item.exact ?? false);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={
              active
                ? `${itemBase} bg-blue-pale text-blue font-semibold`
                : `${itemBase} text-foreground hover:bg-secondary font-medium`
            }
          >
            {icon}
            <span className="min-w-0 flex-1 truncate">{t(item.labelKey)}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function SoonTag({ label }: { label: string }) {
  return (
    <span className="bg-secondary text-muted-foreground shrink-0 rounded-full px-1.5 py-0.5 text-[10.5px] font-semibold tracking-[0.02em] whitespace-nowrap">
      {label}
    </span>
  );
}

function NavSubItem({
  child,
  pathname,
  label,
  soon,
}: {
  child: NavChild;
  pathname: string;
  label: string;
  soon: string;
}) {
  const subBase =
    'flex items-center gap-2 rounded-[8px] px-3 py-1.5 text-[13.5px] outline-none focus-visible:ring-3 focus-visible:ring-blue/40';

  if (child.disabled) {
    return (
      <span aria-disabled="true" className={`${subBase} text-muted-foreground/60 cursor-default`}>
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <SoonTag label={soon} />
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
