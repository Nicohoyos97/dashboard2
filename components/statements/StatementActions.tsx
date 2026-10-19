'use client';

import { ExportMenu } from '@/components/dashboard/ExportMenu';

// A statement page's one take-away control (§7): the firm's report template as
// CSV or PDF, the original document the firm uploaded, and print. The PDF
// report and the original are different artefacts — one rendered from the
// published lines, one the file itself — so both are offered, inside one menu.
export function StatementActions({
  versionId,
  csvHref,
  pdfHref,
}: {
  versionId: string | null;
  csvHref: string | null;
  pdfHref: string | null;
}) {
  return (
    <div className="print:hidden">
      <ExportMenu
        formats={[
          { format: 'csv', href: csvHref },
          { format: 'pdf', href: pdfHref },
        ]}
        originalHref={versionId ? `/api/documents/${versionId}/download` : null}
        print
      />
    </div>
  );
}
