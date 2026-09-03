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

// Available reports / documents (§6 tiles grid): one tile per published
// document, click to download the exact original through the audited route.
export async function ReportTiles({ documents, showLibraryLink = false }: { documents: PublishedDocument[]; showLibraryLink?: boolean }) {
  const [t, tAdmin, locale] = await Promise.all([getTranslations('Overview'), getTranslations('Admin'), getLocale()]);
  return (
    <section className="border-line bg-card rounded-2xl border p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-ink text-[16px] font-semibold">{t('reportsTitle')}</h2>
        {showLibraryLink && (
          <Link href="/reports" className="text-blue text-[12.5px] font-semibold hover:underline">
            {t('reportsViewAll')}
          </Link>
        )}
      </div>
      {documents.length === 0 ? (
        <p className="text-muted-foreground mt-3 text-[14px]">{t('reportsEmpty')}</p>
      ) : (
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {documents.map((d) => {
            const Icon = ICON[d.documentType] ?? FileText;
            return (
              <li key={d.id}>
                {d.currentVersionId ? (
                  <a
                    href={`/api/documents/${d.currentVersionId}/download`}
                    className="border-line hover:border-blue/50 hover:bg-paper group flex h-full flex-col rounded-xl border p-4 transition"
                  >
                    <span className="bg-blue-pale text-blue flex size-9 items-center justify-center rounded-lg">
                      <Icon className="size-[18px]" aria-hidden="true" />
                    </span>
                    <span className="text-ink mt-3 line-clamp-2 text-[14px] font-semibold">{d.title}</span>
                    <span className="text-muted-foreground mt-1 text-[12.5px]">
                      {tAdmin(`type_${d.documentType}`)}
                      {d.periodStart && d.periodEnd ? ` · ${formatPeriod(d.periodStart, d.periodEnd, locale)}` : ''}
                    </span>
                    <span className="text-blue mt-auto inline-flex items-center gap-1 pt-3 text-[12.5px] font-semibold">
                      <Download className="size-3.5" aria-hidden="true" />
                      {t('downloadOriginal')}
                    </span>
                  </a>
                ) : (
                  <div className="border-line bg-paper flex h-full flex-col rounded-xl border p-4">
                    <span className="bg-secondary text-muted-foreground flex size-9 items-center justify-center rounded-lg">
                      <Icon className="size-[18px]" aria-hidden="true" />
                    </span>
                    <span className="text-ink mt-3 line-clamp-2 text-[14px] font-semibold">{d.title}</span>
                    <span className="text-muted-foreground mt-1 text-[12.5px]">{t('reportsUnavailable')}</span>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
