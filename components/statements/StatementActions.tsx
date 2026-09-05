'use client';

import { Download, Printer } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { secondaryButton } from '@/components/admin/ui';
import { ExportMenu } from '@/components/dashboard/ExportMenu';

// Print, CSV/PDF export and original-PDF download for a statement page (§7).
// The PDF here is the firm's report template rendered from the published
// lines; "Download PDF" below it is the original document the firm uploaded.
// They are different artefacts, so both are offered.
export function StatementActions({
  versionId,
  csvHref,
  pdfHref,
}: {
  versionId: string | null;
  csvHref: string | null;
  pdfHref: string | null;
}) {
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
          { format: 'pdf', href: pdfHref },
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
