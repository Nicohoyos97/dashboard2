'use client';

// One "Export" control with the formats behind it, replacing a row of
// format-named buttons. A format the page cannot produce yet is listed and
// disabled with the reason — the repo's rule is a disabled control that says
// why, never a button that does nothing.
import { ChevronDown, Download, FileSpreadsheet, FileType2, Printer, Upload } from 'lucide-react';
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

const itemClass =
  'text-ink data-[highlighted]:bg-blue-pale flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-ui outline-none';

/**
 * Everything the owner can take away from a page, behind one button: the
 * formats, then — on a statement — the original document the firm uploaded
 * and the browser's print. Three buttons in a row had become two rows of them
 * on a phone, for actions used a few times a month.
 */
export function ExportMenu({
  formats,
  originalHref,
  print = false,
}: {
  formats: ExportFormat[];
  /** The uploaded original, when the figures came from a document. */
  originalHref?: string | null;
  print?: boolean;
}) {
  const t = useTranslations('Statements');
  if (formats.length === 0 && !originalHref && !print) return null;

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
          className="border-line bg-card z-50 w-[min(280px,calc(100vw-2rem))] rounded-xl border p-1.5 shadow-menu"
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
                  className="text-muted-foreground flex items-start gap-2.5 rounded-lg px-2.5 py-2 text-ui outline-none"
                >
                  <Icon className="mt-0.5 size-4 shrink-0 opacity-60" aria-hidden="true" />
                  <span className="min-w-0">
                    <span className="block font-medium">{label}</span>
                    {entry.unavailable && (
                      <span className="block text-caption leading-[1.4]">{entry.unavailable}</span>
                    )}
                  </span>
                </DropdownMenu.Item>
              );
            }

            return (
              <DropdownMenu.Item key={entry.format} asChild>
                <a href={entry.href ?? '#'} className={itemClass}>
                  <Icon className="text-link size-4 shrink-0" aria-hidden="true" />
                  <span className="font-medium">{label}</span>
                </a>
              </DropdownMenu.Item>
            );
          })}
          {(originalHref || print) && formats.length > 0 && <DropdownMenu.Separator className="bg-line my-1 h-px" />}
          {originalHref && (
            <DropdownMenu.Item asChild>
              <a href={originalHref} className={itemClass}>
                <Download className="text-link size-4 shrink-0" aria-hidden="true" />
                <span className="font-medium">{t('exportOriginalOption')}</span>
              </a>
            </DropdownMenu.Item>
          )}
          {print && (
            <DropdownMenu.Item onSelect={() => window.print()} className={itemClass}>
              <Printer className="text-link size-4 shrink-0" aria-hidden="true" />
              <span className="font-medium">{t('print')}</span>
            </DropdownMenu.Item>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
