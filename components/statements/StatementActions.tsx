'use client';

import { Download, Printer } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { secondaryButton } from '@/components/admin/ui';
import { ExportMenu } from '@/components/dashboard/ExportMenu';

// Print, CSV export and original-PDF download for a statement page (§7).
export function StatementActions({ versionId, csvHref }: { versionId: string | null; csvHref: string | null }) {
  const t = useTranslations('Statements');
  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      <button type="button" onClick={() => window.print()} className={`${secondaryButton} h-10`}>
        <Printer className="size-4" aria-hidden="true" />
        {t('print')}
      </button>
      <ExportMenu
        formats={[
          { format: 'csv', href: csvHref },
          // Wired the day the firm's PDF report template lands; until then it
          // is listed and says why, rather than being a button that does
          // nothing or a silently missing option.
          { format: 'pdf', href: null, unavailable: t('exportPdfPending') },
        ]}
      />
      {versionId && (
        <a href={`/api/documents/${versionId}/download`} className={`${secondaryButton} h-10`}>
          <Download className="size-4" aria-hidden="true" />
          {t('downloadPdf')}
        </a>
      )}
    </div>
  );
}
