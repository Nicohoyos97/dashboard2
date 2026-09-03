'use client';

// Responsive app shell shared by both portals (INITIAL_PROMPT.md §6, §7):
// a fixed 248 px sidebar from `md` up with a faint brand glow at its foot, a
// desktop top bar passed in by the layout, a compact bar with a hamburger
// below `md`, and the same sidebar content inside an accessible drawer
// (Radix Dialog: focus trap, Escape, overlay click). The drawer closes on
// navigation.
import { Menu, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Dialog } from 'radix-ui';
import { useEffect, useState } from 'react';

import { usePathname } from '@/i18n/navigation';

import { ThemeToggle } from '../theme/ThemeToggle';
import { Brand } from './Brand';

export function AppShell({
  sidebar,
  topBar,
  brandHref,
  brandBadge,
  children,
}: {
  sidebar: React.ReactNode;
  topBar?: React.ReactNode;
  brandHref: string;
  brandBadge?: string;
  children: React.ReactNode;
}) {
  const t = useTranslations('Shell');
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const brandProps = brandBadge ? { href: brandHref, badge: brandBadge } : { href: brandHref };

  return (
    <div className="bg-paper min-h-screen md:flex">
      <aside
        aria-label={t('navigation')}
        className="border-line/80 bg-card sidebar-glow sticky top-0 hidden h-screen w-[248px] shrink-0 flex-col border-r px-4 pt-6 pb-5 md:flex"
      >
        <div className="px-2">
          <Brand {...brandProps} />
        </div>
        {sidebar}
      </aside>

      <header className="border-line bg-card sticky top-0 z-30 flex h-14 items-center gap-3 border-b px-3 md:hidden">
        <Dialog.Root open={open} onOpenChange={setOpen}>
          <Dialog.Trigger asChild>
            <button
              type="button"
              aria-label={t('openMenu')}
              className="text-ink hover:bg-secondary focus-visible:ring-blue/40 inline-flex size-10 items-center justify-center rounded-xl outline-none focus-visible:ring-3"
            >
              <Menu className="size-5" strokeWidth={1.75} aria-hidden="true" />
            </button>
          </Dialog.Trigger>
          <Dialog.Portal>
            <Dialog.Overlay className="bg-ink/40 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 fixed inset-0 z-40" />
            <Dialog.Content className="bg-card sidebar-glow data-[state=open]:animate-in data-[state=open]:slide-in-from-left data-[state=closed]:animate-out data-[state=closed]:slide-out-to-left fixed inset-y-0 left-0 z-50 flex w-[288px] max-w-[88vw] flex-col px-4 pt-5 pb-5 shadow-xl outline-none">
              <Dialog.Title className="sr-only">{t('navigation')}</Dialog.Title>
              <div className="flex items-center justify-between px-2">
                <Brand {...brandProps} />
                <Dialog.Close asChild>
                  <button
                    type="button"
                    aria-label={t('closeMenu')}
                    className="text-muted-foreground hover:bg-secondary hover:text-ink inline-flex size-9 items-center justify-center rounded-xl"
                  >
                    <X className="size-5" strokeWidth={1.75} aria-hidden="true" />
                  </button>
                </Dialog.Close>
              </div>
              {sidebar}
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
        <Brand {...brandProps} compact />
        <div className="ml-auto">
          <ThemeToggle variant="icon" />
        </div>
      </header>

      <div className="min-w-0 flex-1">
        {topBar}
        {children}
      </div>
    </div>
  );
}
