import { Download, FileText, Landmark, Receipt } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';

import { Link } from '@/i18n/navigation';
import type { PublishedDocument } from '@/lib/portal/load';
import { formatPeriod } from '@/lib/utils/dates';

const ICON: Record<string, typeof FileText> = {
  bank_statement: Landmark,
  sales_tax_filing: Receipt,
  sales_tax_payment: Receipt,
  income_tax_document: Receipt,
};

// Available reports / documents: one row per published document, a click
// downloads the exact original through the audited route. Rows rather than a
// grid of bordered tiles: a tile inside the card was a card inside a card, and
// a list reads at a glance in a narrow column and on a phone alike.
export async function ReportTiles({
  documents,
  showLibraryLink = false,
  bare = false,
}: {
  documents: PublishedDocument[];
  showLibraryLink?: boolean;
  /** No card and no heading: the reports library page is the list itself. */
  bare?: boolean;
}) {
  const [t, tAdmin, locale] = await Promise.all([getTranslations('Overview'), getTranslations('Admin'), getLocale()]);
  const list =
    documents.length === 0 ? (
      <p className="text-muted-foreground mt-3 text-ui">{t('reportsEmpty')}</p>
    ) : (
      <ul className={`divide-line divide-y ${bare ? '' : 'mt-2'}`}>
        {documents.map((d) => {
          const Icon = ICON[d.documentType] ?? FileText;
          const meta = `${tAdmin(`type_${d.documentType}`)}${d.periodStart && d.periodEnd ? ` · ${formatPeriod(d.periodStart, d.periodEnd, locale)}` : ''}`;
          return (
            <li key={d.id}>
              {d.currentVersionId ? (
                <a
                  href={`/api/documents/${d.currentVersionId}/download`}
                  className="group hover:bg-secondary focus-visible:ring-brand/40 -mx-2 flex items-center gap-3 rounded-xl px-2 py-3 transition-colors outline-none focus-visible:ring-3"
                >
                  <span className="bg-blue-pale text-link flex size-9 shrink-0 items-center justify-center rounded-lg">
                    <Icon className="size-[18px]" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="text-ink line-clamp-2 block text-ui font-semibold break-words">{d.title}</span>
                    <span className="text-muted-foreground block truncate text-small">{meta}</span>
                  </span>
                  <span className="text-muted-foreground group-hover:text-link flex size-9 shrink-0 items-center justify-center rounded-lg transition-colors">
                    <Download className="size-[18px]" aria-hidden="true" />
                    <span className="sr-only">{t('downloadOriginal')}</span>
                  </span>
                </a>
              ) : (
                <div className="-mx-2 flex items-center gap-3 px-2 py-3">
                  <span className="bg-secondary text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-lg">
                    <Icon className="size-[18px]" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="text-ink line-clamp-2 block text-ui font-semibold break-words">{d.title}</span>
                    <span className="text-muted-foreground block truncate text-small">{t('reportsUnavailable')}</span>
                  </span>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    );

  if (bare) return list;
  return (
    <section className="border-line bg-card flex flex-col rounded-2xl border p-5 shadow-card">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-ink text-title font-semibold">{t('reportsTitle')}</h2>
        {showLibraryLink && (
          <Link href="/reports" className="text-link hover:text-link-hover text-small font-semibold hover:underline">
            {t('reportsViewAll')}
          </Link>
        )}
      </div>
      {list}
    </section>
  );
}
