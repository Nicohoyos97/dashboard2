'use client';

// One "Export" control with the formats behind it, replacing a row of
// format-named buttons. A format the page cannot produce yet is listed and
// disabled with the reason — the repo's rule is a disabled control that says
// why, never a button that does nothing.
import { ChevronDown, FileSpreadsheet, FileType2, Upload } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { DropdownMenu } from 'radix-ui';

import { secondaryButton } from '@/components/admin/ui';

export type ExportFormat = {
  format: 'csv' | 'pdf';
  href: string | null;
  /** Why this format is unavailable. Rendered under the label when set. */
  unavailable?: string;
};

const ICON = {
  csv: FileSpreadsheet,
  pdf: FileType2,
} as const;

export function ExportMenu({ formats }: { formats: ExportFormat[] }) {
  const t = useTranslations('Statements');
  if (formats.length === 0) return null;

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button type="button" className={`${secondaryButton} h-10`}>
          <Upload className="size-4" aria-hidden="true" />
          {t('export')}
          <ChevronDown className="size-4 opacity-70" aria-hidden="true" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="border-line bg-card z-50 w-[280px] rounded-xl border p-1.5 shadow-[0_8px_24px_rgba(15,23,42,0.12)]"
        >
          {formats.map((entry) => {
            const Icon = ICON[entry.format];
            const label = t(entry.format === 'csv' ? 'exportCsvOption' : 'exportPdfOption');
            const blocked = entry.unavailable !== undefined || entry.href === null;

            if (blocked) {
              return (
                <DropdownMenu.Item
                  key={entry.format}
                  disabled
                  className="text-muted-foreground flex items-start gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] outline-none"
                >
                  <Icon className="mt-0.5 size-4 shrink-0 opacity-60" aria-hidden="true" />
                  <span className="min-w-0">
                    <span className="block font-medium">{label}</span>
                    {entry.unavailable && (
                      <span className="block text-[12px] leading-[1.4]">{entry.unavailable}</span>
                    )}
                  </span>
                </DropdownMenu.Item>
              );
            }

            return (
              <DropdownMenu.Item key={entry.format} asChild>
                <a
                  href={entry.href ?? '#'}
                  className="text-ink data-[highlighted]:bg-blue-pale flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] outline-none"
                >
                  <Icon className="text-blue size-4 shrink-0" aria-hidden="true" />
                  <span className="font-medium">{label}</span>
                </a>
              </DropdownMenu.Item>
            );
          })}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
