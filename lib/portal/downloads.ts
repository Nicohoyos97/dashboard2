import { formatPeriod } from '@/lib/utils/dates';

import type { PublishedDocument } from './load';

export type DownloadItem = { versionId: string; title: string; subtitle: string };

/**
 * The published documents as rows of the Download Reports menu.
 *
 * Shared because the menu now has three callers — the two Overviews and the
 * app shell's mobile bar — and a row whose subtitle was built differently in
 * one of them would read as a different document.
 *
 * A document with no current version has no bytes to serve, so it is dropped
 * rather than offered as a link the download route would refuse.
 */
export function downloadItemsFor(documents: PublishedDocument[], locale: string): DownloadItem[] {
  return documents.flatMap((document) =>
    document.currentVersionId
      ? [
          {
            versionId: document.currentVersionId,
            title: document.title,
            subtitle:
              document.periodStart && document.periodEnd
                ? formatPeriod(document.periodStart, document.periodEnd, locale)
                : '',
          },
        ]
      : [],
  );
}
