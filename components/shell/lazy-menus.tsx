'use client';

// The shell's menus, with their code loaded after the page rather than with it.
//
// Radix's popper (floating-ui and the menu primitives, ~19 kB gzipped) was in
// the first load of every portal page because the shell's five menus imported
// it — notifications, the account button, the sidebar's user row, the business
// switcher and the reports menu. On the pages that do not use it themselves
// (chat, help, reports, settings, the firm's portal) nothing needed it until
// somebody opened one of them.
//
// Each wrapper renders the menu's own trigger (menu-triggers.tsx) as a plain
// button, imports the menu once the browser is idle, and swaps it in closed.
// A click before then is not lost: it imports the menu at once and opens it on
// arrival. A button that had keyboard focus hands it to its replacement.
import { type ComponentType, useCallback, useEffect, useRef, useState } from 'react';

import type { DownloadItem } from '@/lib/portal/downloads';
import type { CurrentEntity } from '@/lib/auth/getCurrentEntity';
import type { PortalNotification } from '@/lib/portal/notifications';

import { AccountTrigger, BellTrigger, DownloadTrigger, EntityTrigger, UserRowTrigger } from './menu-triggers';
import type { ShellUser } from './UserMenu';

type Opens = { defaultOpen?: boolean };

function whenIdle(run: () => void): () => void {
  if (typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(run, { timeout: 2000 });
    return () => window.cancelIdleCallback(id);
  }
  const id = window.setTimeout(run, 300);
  return () => window.clearTimeout(id);
}

function useLazyMenu<P extends object>(load: () => Promise<ComponentType<P & Opens>>) {
  const [Menu, setMenu] = useState<ComponentType<P & Opens> | null>(null);
  const [openOnArrival, setOpenOnArrival] = useState(false);
  const box = useRef<HTMLSpanElement>(null);
  const hadFocus = useRef(false);

  const fetchMenu = useCallback(() => {
    void load().then((loaded) => setMenu(() => loaded));
  }, [load]);
  useEffect(() => whenIdle(fetchMenu), [fetchMenu]);
  useEffect(() => {
    if (Menu && hadFocus.current) box.current?.querySelector<HTMLElement>('button')?.focus();
  }, [Menu]);

  const placeholder = {
    onClick: () => {
      setOpenOnArrival(true);
      fetchMenu();
    },
    onFocus: () => {
      hadFocus.current = true;
    },
    onBlur: () => {
      hadFocus.current = false;
    },
    'aria-haspopup': 'menu' as const,
    'aria-expanded': false,
  };
  return { Menu, openOnArrival, box, placeholder };
}

// One loader per menu, at module level so each is a stable function.
const loadBell = () => import('./NotificationBell').then((m) => m.NotificationBellLoaded);
const loadAccount = () => import('./TopAccountMenu').then((m) => m.TopAccountMenuLoaded);
const loadUser = () => import('./UserMenu').then((m) => m.UserMenuLoaded);
const loadEntities = () => import('./EntitySwitcher').then((m) => m.EntitySwitcherLoaded);
const loadDownloads = () => import('@/components/dashboard/DownloadReportsMenu').then((m) => m.DownloadReportsMenuLoaded);

export function NotificationBell(props: { notifications: PortalNotification[] }) {
  const { Menu, openOnArrival, box, placeholder } = useLazyMenu(loadBell);
  return (
    <span ref={box} className="contents">
      {Menu ? (
        <Menu {...props} defaultOpen={openOnArrival} />
      ) : (
        <BellTrigger unread={props.notifications.filter((n) => n.readAt === null).length} {...placeholder} />
      )}
    </span>
  );
}

export function TopAccountMenu(props: { businessName: string; logoUrl: string | null; profileHref: string }) {
  const { Menu, openOnArrival, box, placeholder } = useLazyMenu(loadAccount);
  return (
    <span ref={box} className="contents">
      {Menu ? (
        <Menu {...props} defaultOpen={openOnArrival} />
      ) : (
        <AccountTrigger businessName={props.businessName} logoUrl={props.logoUrl} {...placeholder} />
      )}
    </span>
  );
}

export function UserMenu(props: { user: ShellUser; roleLabel: string; profileHref: string }) {
  const { Menu, openOnArrival, box, placeholder } = useLazyMenu(loadUser);
  return (
    <span ref={box} className="contents">
      {Menu ? (
        <Menu {...props} defaultOpen={openOnArrival} />
      ) : (
        <UserRowTrigger
          name={props.user.name.trim() || props.user.email}
          avatarUrl={props.user.avatarUrl}
          roleLabel={props.roleLabel}
          {...placeholder}
        />
      )}
    </span>
  );
}

export function EntitySwitcher(props: { entities: CurrentEntity[]; currentId: string }) {
  const { Menu, openOnArrival, box, placeholder } = useLazyMenu(loadEntities);
  const current = props.entities.find((e) => e.id === props.currentId) ?? props.entities[0];
  return (
    <span ref={box} className="contents">
      {Menu ? <Menu {...props} defaultOpen={openOnArrival} /> : <EntityTrigger name={current?.name} {...placeholder} />}
    </span>
  );
}

export function DownloadReportsMenu(props: { items: DownloadItem[]; variant?: 'page' | 'compact' }) {
  const { Menu, openOnArrival, box, placeholder } = useLazyMenu(loadDownloads);
  if (props.items.length === 0) return null;
  return (
    <span ref={box} className="contents">
      {Menu ? (
        <Menu {...props} defaultOpen={openOnArrival} />
      ) : (
        <DownloadTrigger compact={props.variant === 'compact'} {...placeholder} />
      )}
    </span>
  );
}
