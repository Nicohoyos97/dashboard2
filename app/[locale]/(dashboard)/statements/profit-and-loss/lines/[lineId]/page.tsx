// One Profit & Loss account and the transactions behind it, from the month's
// General Ledger (0026). The page the P&L links to for accounts that are not
// expenses — sales, other income — since the statement itself shows account
// totals only and Expenses is where cost and expense accounts open.
import { CheckCircle2, ChevronLeft } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { z } from 'zod';

import { PayeeList } from '@/components/ledger/PayeeList';
import { TransactionList } from '@/components/ledger/TransactionList';
import { PortalPage } from '@/components/portal/PortalPage';
import { Link } from '@/i18n/navigation';
import { logAccess } from '@/lib/audit/logAccess';
import { getCurrentEntity } from '@/lib/auth/getCurrentEntity';
import { loadLedgerDetail, loadLedgerTransactions } from '@/lib/ledger/load';
import { formatCents } from '@/lib/money';
import { loadPortalEntitySettings, loadPublishedReport, loadReportLines } from '@/lib/portal/load';
import { periodParam } from '@/lib/portal/period-param';
import { buildTree } from '@/lib/reports/tree';
import { createClient } from '@/lib/supabase/server';
import { formatPeriod } from '@/lib/utils/dates';

const paramsSchema = z.object({ lineId: z.string().uuid() });

export default async function LedgerLinePage({ params }: { params: Promise<{ lineId: string }> }) {
  const parsed = paramsSchema.safeParse(await params);
  if (!parsed.success) notFound();
  const { lineId } = parsed.data;

  const [entity, t, tStatements, locale] = await Promise.all([
    getCurrentEntity(),
    getTranslations('Ledger'),
    getTranslations('Statements'),
    getLocale(),
  ]);
  if (!entity) notFound();

  const supabase = await createClient();
  const settings = await loadPortalEntitySettings(supabase, entity.id);
  if (!settings.modules.bookkeeping) notFound();

  // The line names its statement; RLS returns it only from a published one.
  const { data: line } = await supabase
    .from('financial_statement_lines')
    .select('id, report_id, account_name')
    .eq('id', lineId)
    .eq('business_entity_id', entity.id)
    .maybeSingle();
  const report = line ? await loadPublishedReport(supabase, entity.id, line.report_id) : null;
  if (!line || !report || report.reportType !== 'profit_and_loss') notFound();

  const roots = buildTree(await loadReportLines(supabase, entity.id, report.id));
  const detail = (await loadLedgerDetail(supabase, entity.id, report, roots))?.lines.get(lineId) ?? null;
  const txns = detail ? await loadLedgerTransactions(supabase, entity.id, [detail.accountId]) : [];
  const currency = report.currency;
  const period = formatPeriod(report.periodStart, report.periodEnd, locale);
  const back = `/statements/profit-and-loss?period=${periodParam({ start: report.periodStart, end: report.periodEnd })}`;

  await logAccess({
    action: 'ledger.view',
    resourceType: 'financial_report',
    resourceId: report.id,
    businessEntityId: entity.id,
    metadata: { transaction_count: txns.length },
  });

  return (
    <PortalPage title={line.account_name} lede={`${entity.name} · ${period}`}>
      <Link href={back} className="text-muted-foreground hover:text-ink mt-3 inline-flex items-center gap-1 text-[13.5px] font-medium">
        <ChevronLeft className="size-4" aria-hidden="true" />
        {tStatements('pnlTitle')}
      </Link>

      {!detail ? (
        <p className="border-line bg-card text-muted-foreground mt-6 rounded-2xl border p-5 text-[14px]">{t('notAvailable')}</p>
      ) : (
        <>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="border-line bg-card rounded-2xl border p-5">
              <p className="text-muted-foreground text-[13px] font-medium">{t('accountTotal', { period })}</p>
              <p className="text-ink mt-1 text-[26px] font-bold tabular-nums">{formatCents(detail.totalCents, currency)}</p>
            </div>
            <div className="border-line bg-card rounded-2xl border p-5">
              <p className="text-muted-foreground text-[13px] font-medium">{t('transactionsLabel')}</p>
              <p className="text-ink mt-1 text-[26px] font-bold tabular-nums">{txns.length}</p>
            </div>
          </div>
          <p className="text-muted-foreground mt-3 flex items-center gap-2 text-[13px]">
            <CheckCircle2 className="text-success size-4 shrink-0" aria-hidden="true" />
            {t('addsUp', { count: txns.length, total: formatCents(detail.totalCents, currency) })}
          </p>

          <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1.4fr]">
            <section className="border-line bg-card self-start overflow-hidden rounded-2xl border">
              <h2 className="text-ink border-line border-b px-5 py-4 text-[16px] font-semibold">{t('whereFrom')}</h2>
              <PayeeList txns={txns} currency={currency} />
            </section>
            <section className="border-line bg-card rounded-2xl border p-5">
              <h2 className="text-ink mb-4 text-[16px] font-semibold">{t('transactionsLabel')}</h2>
              <TransactionList txns={txns} currency={currency} />
            </section>
          </div>
        </>
      )}
    </PortalPage>
  );
}
