'use client';

// The shell menus' trigger buttons, apart from the menus themselves and with
// no Radix in them. Each is rendered in two places over a page's life: as a
// plain button, from the server and until the menu's code arrives
// (lazy-menus.tsx), and then as the Radix root's own trigger — `asChild` hands
// Radix's props and ref through `...props`. One markup for both is what keeps
// the swap invisible.
import { Bell, Building2, ChevronDown, ChevronsUpDown, Download } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ComponentProps } from 'react';

import { initials } from '@/lib/utils/initials';

type ButtonProps = ComponentProps<'button'>;

export function BellTrigger({ unread, ...props }: { unread: number } & ButtonProps) {
  const t = useTranslations('Notifications');
  return (
    <button
      type="button"
      aria-label={unread > 0 ? t('openWithCount', { count: unread }) : t('open')}
      className="text-muted-foreground hover:bg-secondary hover:text-ink focus-visible:ring-brand/40 relative inline-flex size-10 items-center justify-center rounded-xl transition outline-none focus-visible:ring-3"
      {...props}
    >
      <Bell className="size-[18px]" strokeWidth={1.75} aria-hidden="true" />
      {unread > 0 && (
        <span className="bg-danger ring-card absolute top-1.5 right-1.5 min-w-[16px] rounded-full px-1 text-micro leading-4 font-bold text-white ring-2">
          {unread > 9 ? '9+' : unread}
        </span>
      )}
    </button>
  );
}

export function AccountTrigger({ businessName, logoUrl, ...props }: { businessName: string; logoUrl: string | null } & ButtonProps) {
  const t = useTranslations('Shell');
  return (
    <button
      type="button"
      aria-label={t('accountMenu')}
      title={businessName}
      className="border-line bg-secondary hover:border-brand/40 focus-visible:ring-brand/40 ml-1 inline-flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full border transition outline-none focus-visible:ring-3"
      {...props}
    >
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- firm-set, arbitrary host
        <img src={logoUrl} alt="" className="size-full object-cover" />
      ) : (
        <span className="text-muted-foreground text-caption font-semibold">{initials(businessName)}</span>
      )}
    </button>
  );
}

export function UserRowTrigger({
  name,
  avatarUrl,
  roleLabel,
  ...props
}: { name: string; avatarUrl: string | null; roleLabel: string } & ButtonProps) {
  const t = useTranslations('Shell');
  return (
    <button
      type="button"
      aria-label={t('accountMenu')}
      className="hover:bg-secondary focus-visible:ring-brand/40 flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors outline-none focus-visible:ring-3"
      {...props}
    >
      <span className="border-line bg-secondary relative size-9 shrink-0 overflow-hidden rounded-full border">
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- user-uploaded, arbitrary host
          <img src={avatarUrl} alt="" className="size-full object-cover" />
        ) : (
          <span className="text-muted-foreground flex size-full items-center justify-center text-caption font-semibold">
            {initials(name)}
          </span>
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="text-ink block truncate text-ui font-medium">{name}</span>
        <span className="text-muted-foreground block truncate text-small">{roleLabel}</span>
      </span>
    </button>
  );
}

export function EntityTrigger({ name, ...props }: { name: string | undefined } & ButtonProps) {
  const t = useTranslations('Shell');
  return (
    <button
      type="button"
      aria-label={t('switchBusiness')}
      className="border-line bg-card hover:bg-secondary focus-visible:ring-brand/40 flex w-full items-center gap-2.5 rounded-xl border px-3 py-2 text-left outline-none focus-visible:ring-3 disabled:opacity-60"
      {...props}
    >
      <span className="bg-blue-pale text-link flex size-8 shrink-0 items-center justify-center rounded-lg">
        <Building2 className="size-4" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="text-muted-foreground block text-micro font-medium">{t('currentBusiness')}</span>
        <span className="text-ink block truncate text-ui font-semibold">{name}</span>
      </span>
      <ChevronsUpDown className="text-muted-foreground size-4 shrink-0" aria-hidden="true" />
    </button>
  );
}

export function DownloadTrigger({ compact, ...props }: { compact: boolean } & ButtonProps) {
  const t = useTranslations('Overview');
  return (
    <button
      type="button"
      className={
        compact
          ? 'bg-blue hover:bg-blue-hover inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-small font-semibold text-white transition md:hidden'
          : 'bg-blue hover:bg-blue-hover hidden h-11 items-center gap-2 rounded-xl px-4 text-ui font-semibold text-white transition md:inline-flex'
      }
      {...props}
    >
      <Download className={compact ? 'size-[15px]' : 'size-4'} aria-hidden="true" />
      {compact ? t('downloadReportsShort') : t('downloadReports')}
      <ChevronDown className={compact ? 'size-[15px] opacity-80' : 'size-4 opacity-80'} aria-hidden="true" />
    </button>
  );
}
