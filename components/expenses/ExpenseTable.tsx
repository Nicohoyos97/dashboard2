import { ArrowDown, ArrowUp, FileText } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';

import { Link } from '@/i18n/navigation';
import { formatCents } from '@/lib/money';
import { type ExpenseSearchParams, type ExpenseSort, expenseHref } from '@/lib/portal/expense-filters';
import type { ExpenseTxn } from '@/lib/reports/expenses';
import { formatIsoDate } from '@/lib/utils/dates';

// Transactions behind the filtered totals (§7 Expenses). The server renders
// one page at a time — sorting and paging are links, so the browser never
// holds the whole period and the view stays shareable. Every row names the
// account it came from and, when the extraction recorded one, links the
// original document page it was read from.
export async function ExpenseTable({
  rows,
  total,
  page,
  pageSize,
  sort,
  path,
  params,
  currency,
  accountLabels,
}: {
  rows: readonly ExpenseTxn[];
  total: number;
  page: number;
  pageSize: number;
  sort: ExpenseSort;
  path: string;
  params: ExpenseSearchParams;
  currency: string;
  accountLabels: ReadonlyMap<string, string>;
}) {
  const [t, locale] = await Promise.all([getTranslations('Expenses'), getLocale()]);
  const money = (cents: number) => formatCents(cents, currency);
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  const sortLink = (column: 'date' | 'amount', label: string) => {
    const active = sort.startsWith(column);
    const ascending = sort === `${column}_asc`;
    const next: ExpenseSort = active && !ascending ? `${column}_asc` : `${column}_desc`;
    return (
      <Link
        href={expenseHref(path, params, { sort: next })}
        className="text-muted-foreground hover:text-ink inline-flex items-center gap-1 font-medium"
        aria-label={t('sortBy', { column: label })}
      >
        {label}
        {active ? (
          ascending ? (
            <ArrowUp className="size-3.5" aria-hidden="true" />
          ) : (
            <ArrowDown className="size-3.5" aria-hidden="true" />
          )
        ) : null}
      </Link>
    );
  };

  if (total === 0) {
    return <p className="text-muted-foreground text-[14px]">{t('tableEmpty')}</p>;
  }

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-[13.5px]">
          <caption className="sr-only">{t('tableCaption')}</caption>
          <thead>
            <tr className="border-line border-b text-left">
              <th scope="col" className="py-2 pr-3 font-medium">
                {sortLink('date', t('columnDate'))}
              </th>
              <th scope="col" className="text-muted-foreground py-2 pr-3 font-medium">
                {t('columnDescription')}
              </th>
              <th scope="col" className="text-muted-foreground py-2 pr-3 font-medium">
                {t('columnCategory')}
              </th>
              <th scope="col" className="text-muted-foreground py-2 pr-3 font-medium">
                {t('columnVendor')}
              </th>
              <th scope="col" className="text-muted-foreground py-2 pr-3 font-medium">
                {t('columnAccount')}
              </th>
              <th scope="col" className="py-2 pl-3 text-right font-medium">
                {sortLink('amount', t('columnAmount'))}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-line-soft hover:bg-secondary/50 border-b last:border-0">
                <td className="text-muted-foreground py-2.5 pr-3 whitespace-nowrap tabular-nums">{formatIsoDate(row.date, locale)}</td>
                <td className="text-ink py-2.5 pr-3">
                  <span className="flex items-center gap-2">
                    <span className="max-w-[320px] truncate">{row.description}</span>
                    {row.isRecurring === true && (
                      <span className="bg-secondary text-muted-foreground shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold">{t('recurringYes')}</span>
                    )}
                    {row.documentVersionId && (
                      <a
                        href={`/api/documents/${row.documentVersionId}/download`}
                        className="text-muted-foreground hover:text-blue flex shrink-0 items-center gap-1 text-[11px]"
                        aria-label={t('openSource')}
                        title={t('openSource')}
                      >
                        <FileText className="size-3.5" aria-hidden="true" />
                        {/* The route serves the file as an attachment, so a page cannot be opened directly; it is stated, not linked. */}
                        {row.pageNumber && <span aria-hidden="true">{t('pageRef', { page: row.pageNumber })}</span>}
                      </a>
                    )}
                  </span>
                </td>
                <td className="text-muted-foreground py-2.5 pr-3">{row.categoryName ?? t('uncategorized')}</td>
                <td className="text-muted-foreground py-2.5 pr-3">{row.vendor ?? t('noVendor')}</td>
                <td className="text-muted-foreground py-2.5 pr-3 whitespace-nowrap">{accountLabels.get(row.bankAccountId) ?? t('unknownAccount')}</td>
                <td className="text-ink py-2.5 pl-3 text-right font-semibold tabular-nums">{money(row.amountCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <nav aria-label={t('paginationLabel')} className="mt-4 flex flex-wrap items-center justify-between gap-3 text-[13px]">
        <p className="text-muted-foreground">{t('showing', { from, to, total })}</p>
        <div className="flex items-center gap-2">
          {/* At the ends these are disabled *controls*, not dimmed text: as a
              span the greyed label was a 2.46:1 contrast failure and a screen
              reader read it as stray words rather than an unavailable button. */}
          {page > 1 ? (
            <Link href={expenseHref(path, params, { page: String(page - 1) })} className="text-blue font-semibold hover:underline">
              {t('previous')}
            </Link>
          ) : (
            <button type="button" disabled className="text-muted-foreground/60">
              {t('previous')}
            </button>
          )}
          <span className="text-muted-foreground">{t('pageOf', { page, pages })}</span>
          {page < pages ? (
            <Link href={expenseHref(path, params, { page: String(page + 1) })} className="text-blue font-semibold hover:underline">
              {t('next')}
            </Link>
          ) : (
            <button type="button" disabled className="text-muted-foreground/60">
              {t('next')}
            </button>
          )}
        </div>
      </nav>
    </>
  );
}
