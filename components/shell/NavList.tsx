'use client';

// Sidebar navigation for both portals. Client-only because it reads the
// current path to highlight the active item. Items with `children` render as
// a group that starts collapsed and opens on click — already open when the
// current page is one of its children, so the page you are on is never hidden
// behind a closed group. Disabled items render non-interactive with a
// "coming soon" tag, never a dead link. Style per DESIGN.md → Navigation:
// outlined 18px icons, 14px regular labels, a filled pill for the current page.
import {
  ChevronDown,
  CircleHelp,
  FileText,
  FolderOpen,
  Inbox,
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
import { type ReactNode, useId, useState } from 'react';

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
  help: CircleHelp,
  navDashboard: LayoutDashboard,
  navClients: Users,
  navUpload: Upload,
  navDocuments: FolderOpen,
  navAudit: ShieldCheck,
  navRequests: Inbox,
};

const ICON_STROKE = 1.75;

// The current page is a soft pill rather than a solid one: where you are should
// be findable at a glance, not the loudest thing on the screen. Blue text on
// the pale tint measures 4.7:1 in light and 5.4:1 in dark.
const itemBase =
  'flex h-10 items-center gap-3 rounded-[10px] px-3 text-ui transition-colors outline-none focus-visible:ring-3 focus-visible:ring-brand/40';
const activeItem = `${itemBase} bg-blue-pale text-link font-semibold`;
const idleItem = `${itemBase} text-foreground/85 hover:bg-secondary hover:text-ink font-normal`;

export function NavList({
  items,
  namespace,
  variant = 'main',
}: {
  items: NavItem[];
  namespace: 'Nav' | 'Admin';
  variant?: 'main' | 'utility';
}) {
  const t = useTranslations(namespace);
  const tShell = useTranslations('Shell');
  const pathname = usePathname();

  return (
    <nav
      className={
        variant === 'main' ? 'mt-5 flex flex-1 flex-col gap-0.5' : 'flex flex-col gap-0.5'
      }
    >
      {items.map((item) => {
        const Icon = ICONS[item.labelKey];
        const icon = Icon ? (
          <Icon className="size-[18px] shrink-0" strokeWidth={ICON_STROKE} aria-hidden="true" />
        ) : null;

        if (item.children) {
          return (
            <NavGroup
              key={item.href}
              icon={icon}
              label={t(item.labelKey)}
              active={isActiveNav(pathname, item.href)}
            >
              {item.children.map((child) => (
                <NavSubItem
                  key={child.href}
                  child={child}
                  pathname={pathname}
                  label={t(child.labelKey)}
                  soon={tShell('comingSoon')}
                />
              ))}
            </NavGroup>
          );
        }

        if (item.disabled) {
          return (
            <span
              key={item.href}
              aria-disabled="true"
              className={`${itemBase} text-muted-foreground/60 cursor-default`}
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
            className={active ? activeItem : idleItem}
          >
            {icon}
            <span className="min-w-0 flex-1 truncate">{t(item.labelKey)}</span>
            {item.badge ? <CountTag count={item.badge} active={active} /> : null}
          </Link>
        );
      })}
    </nav>
  );
}

// Closed by default. Arriving on one of its pages opens it (a full load, or a
// jump from search or a breadcrumb), since the shell layout — and this state —
// survives client navigation; leaving never closes it behind the reader's back.
function NavGroup({
  icon,
  label,
  active,
  children,
}: {
  icon: ReactNode;
  label: string;
  active: boolean;
  children: ReactNode;
}) {
  const panelId = useId();
  const [open, setOpen] = useState(active);
  const [wasActive, setWasActive] = useState(active);
  if (active !== wasActive) {
    setWasActive(active);
    if (active) setOpen(true);
  }

  return (
    <div className="flex flex-col gap-0.5">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
        className={`${itemBase} hover:bg-secondary w-full text-left ${active ? 'text-link font-semibold' : 'text-foreground/85 hover:text-ink font-normal'}`}
      >
        {icon}
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <ChevronDown
          className={`text-muted-foreground -mx-1 size-3.5 shrink-0 transition-transform motion-reduce:transition-none ${open ? 'rotate-180' : ''}`}
          strokeWidth={ICON_STROKE}
          aria-hidden="true"
        />
      </button>
      <div
        id={panelId}
        hidden={!open}
        className="border-line ml-[21px] flex flex-col gap-0.5 border-l pl-3"
      >
        {children}
      </div>
    </div>
  );
}

// A waiting-work count, announced as part of the link's name rather than as a
// bare number ("Requests, 3 waiting").
function CountTag({ count, active }: { count: number; active: boolean }) {
  const t = useTranslations('Shell');
  return (
    <span
      className={`shrink-0 rounded-full px-1.5 py-0.5 text-micro font-semibold tabular-nums ${active ? 'bg-card text-link' : 'bg-blue-pale text-link'}`}
    >
      {count}
      <span className="sr-only"> {t('waiting')}</span>
    </span>
  );
}

function SoonTag({ label }: { label: string }) {
  return (
    <span className="bg-secondary text-muted-foreground shrink-0 rounded-full px-1.5 py-0.5 text-micro font-medium tracking-[0.02em] whitespace-nowrap">
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
    'flex h-9 items-center gap-2 rounded-[8px] px-3 text-ui outline-none focus-visible:ring-3 focus-visible:ring-brand/40';

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
          ? `${subBase} bg-blue-pale text-link font-semibold`
          : `${subBase} text-foreground/85 hover:bg-secondary hover:text-ink font-normal transition-colors`
      }
    >
      {label}
    </Link>
  );
}
