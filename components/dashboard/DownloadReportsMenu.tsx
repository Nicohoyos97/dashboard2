'use client';

import { ChevronDown, Download, FileText } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { DropdownMenu } from 'radix-ui';

export type DownloadItem = { versionId: string; title: string; subtitle: string };

// "Download Reports" primary action (§6 header): every published document,
// served through the audited signed-URL route.
export function DownloadReportsMenu({ items }: { items: DownloadItem[] }) {
  const t = useTranslations('Overview');
  if (items.length === 0) return null;
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button type="button" className="bg-blue hover:bg-blue-soft inline-flex h-11 items-center gap-2 rounded-xl px-4 text-[14px] font-semibold text-white transition">
          <Download className="size-4" aria-hidden="true" />
          {t('downloadReports')}
          <ChevronDown className="size-4 opacity-80" aria-hidden="true" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={6} className="border-line bg-card z-50 w-[320px] rounded-xl border p-1.5 shadow-[0_8px_24px_rgba(15,23,42,0.12)]">
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
