'use client';

import { FileText } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { DropdownMenu } from 'radix-ui';

import { DownloadTrigger } from '@/components/shell/menu-triggers';
import { Link } from '@/i18n/navigation';
import { DOWNLOAD_MENU_LIMIT, type DownloadItem } from '@/lib/portal/downloads';

// "Download Reports" primary action (§6 header): the newest published
// documents, served through the audited signed-URL route, then the library
// when there are more than the menu lists.
//
// Two placements, one menu. On desktop it is the Overview header's primary
// action; below `md` that header is a cramped place for it, so the compact
// variant rides the app shell's own bar — same icon and caret, shortened to
// "Reports" because the download icon already says what it does. Each variant
// hides at the other's breakpoint, so only one is ever on screen.
export function DownloadReportsMenuLoaded({
  items,
  variant = 'page',
  defaultOpen = false,
}: {
  items: DownloadItem[];
  variant?: 'page' | 'compact';
  defaultOpen?: boolean;
}) {
  const t = useTranslations('Overview');
  if (items.length === 0) return null;
  const compact = variant === 'compact';
  return (
    <DropdownMenu.Root defaultOpen={defaultOpen}>
      <DropdownMenu.Trigger asChild>
        <DownloadTrigger compact={compact} />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={6} collisionPadding={8} className="border-line bg-card z-50 w-[min(320px,calc(100vw-2rem))] rounded-xl border p-1.5 shadow-menu">
          {items.slice(0, DOWNLOAD_MENU_LIMIT).map((d) => (
            <DropdownMenu.Item key={d.versionId} asChild>
              <a href={`/api/documents/${d.versionId}/download`} className="text-ink data-[highlighted]:bg-blue-pale flex cursor-pointer items-start gap-2.5 rounded-lg px-2.5 py-2 text-ui outline-none">
                <FileText className="text-link mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{d.title}</span>
                  <span className="text-muted-foreground block text-caption">{d.subtitle}</span>
                </span>
              </a>
            </DropdownMenu.Item>
          ))}
          {items.length > DOWNLOAD_MENU_LIMIT && (
            <>
              <DropdownMenu.Separator className="bg-line my-1 h-px" />
              <DropdownMenu.Item asChild>
                <Link href="/reports" className="text-link data-[highlighted]:bg-blue-pale block cursor-pointer rounded-lg px-2.5 py-2 text-ui font-semibold outline-none">
                  {t('reportsViewAll')}
                </Link>
              </DropdownMenu.Item>
            </>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
