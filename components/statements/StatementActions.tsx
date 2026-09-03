'use client';

import { Download, Printer, Table2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { secondaryButton } from '@/components/admin/ui';

// Print, CSV export and original-PDF download for a statement page (§7).
export function StatementActions({ versionId, csvHref }: { versionId: string | null; csvHref: string | null }) {
  const t = useTranslations('Statements');
  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      <button type="button" onClick={() => window.print()} className={`${secondaryButton} h-10`}>
        <Printer className="size-4" aria-hidden="true" />
        {t('print')}
      </button>
      {csvHref && (
        <a href={csvHref} className={`${secondaryButton} h-10`}>
          <Table2 className="size-4" aria-hidden="true" />
          {t('exportCsv')}
        </a>
      )}
      {versionId && (
        <a href={`/api/documents/${versionId}/download`} className={`${secondaryButton} h-10`}>
          <Download className="size-4" aria-hidden="true" />
          {t('downloadPdf')}
        </a>
      )}
    </div>
  );
}
