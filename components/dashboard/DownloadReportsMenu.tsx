'use client';

import { ChevronDown, Download, FileText } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { DropdownMenu } from 'radix-ui';

import type { DownloadItem } from '@/lib/portal/downloads';

// "Download Reports" primary action (§6 header): every published document,
// served through the audited signed-URL route.
//
// Two placements, one menu. On desktop it is the Overview header's primary
// action; below `md` that header is a cramped place for it, so the compact
// variant rides the app shell's own bar — same icon and caret, shortened to
// "Reports" because the download icon already says what it does. Each variant
// hides at the other's breakpoint, so only one is ever on screen.
export function DownloadReportsMenu({ items, variant = 'page' }: { items: DownloadItem[]; variant?: 'page' | 'compact' }) {
  const t = useTranslations('Overview');
  if (items.length === 0) return null;
  const compact = variant === 'compact';
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className={
            compact
              ? 'bg-blue hover:bg-blue-soft inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-[13px] font-semibold text-white transition md:hidden'
              : 'bg-blue hover:bg-blue-soft hidden h-11 items-center gap-2 rounded-xl px-4 text-[14px] font-semibold text-white transition md:inline-flex'
          }
        >
          <Download className={compact ? 'size-[15px]' : 'size-4'} aria-hidden="true" />
          {compact ? t('downloadReportsShort') : t('downloadReports')}
          <ChevronDown className={compact ? 'size-[15px] opacity-80' : 'size-4 opacity-80'} aria-hidden="true" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={6} collisionPadding={8} className="border-line bg-card z-50 w-[min(320px,calc(100vw-2rem))] rounded-xl border p-1.5 shadow-[0_8px_24px_rgba(15,23,42,0.12)]">
          {items.map((d) => (
            <DropdownMenu.Item key={d.versionId} asChild>
              <a href={`/api/documents/${d.versionId}/download`} className="text-ink data-[highlighted]:bg-blue-pale flex cursor-pointer items-start gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] outline-none">
                <FileText className="text-blue mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{d.title}</span>
                  <span className="text-muted-foreground block text-[12px]">{d.subtitle}</span>
                </span>
              </a>
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
