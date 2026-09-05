// Document review (INITIAL_PROMPT.md §8): identity + confirmed details, page
// classification, the extracted statement(s) with corrections and
// reconciliation, publish / unpublish, and the immutable version + job history.
import { ChevronLeft } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';

import { JobActions } from '@/components/admin/JobActions';
import { BankReview } from '@/components/admin/review/BankReview';
import { DocumentMetaForm } from '@/components/admin/review/DocumentMetaForm';
import { PagesTable } from '@/components/admin/review/PagesTable';
import { DeleteDocumentBar } from '@/components/admin/review/DeleteDocumentBar';
import { PublishBar } from '@/components/admin/review/PublishBar';
import { ReportHistory } from '@/components/admin/review/ReportHistory';
import { StatementReview } from '@/components/admin/review/StatementReview';
import { VersionsJobs } from '@/components/admin/review/VersionsJobs';
import { card, statusPill } from '@/components/admin/ui';
import { Link } from '@/i18n/navigation';
import { requireFirmMember } from '@/lib/auth/requireFirm';
import { logAccess } from '@/lib/audit/logAccess';
import { loadDerivedHistory } from '@/lib/documents/history';
import { deleteBlockers } from '@/lib/documents/delete';
import { publishBlockers, reviewVersion } from '@/lib/documents/publish';
import { parseReconciliation } from '@/lib/documents/reconciliation';
import { DOCUMENT_TYPES, type DocumentType } from '@/lib/documents/types';
import { createClient } from '@/lib/supabase/server';
import { formatPeriod } from '@/lib/utils/dates';

function asDocumentType(value: string): DocumentType {
  return (DOCUMENT_TYPES as readonly string[]).includes(value) ? (value as DocumentType) : 'other_report';
}

export default async function DocumentReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const [firm, t, locale, { id }] = await Promise.all([
    requireFirmMember(),
    getTranslations('Admin'),
    getLocale(),
    params,
  ]);
  const supabase = await createClient();
  const { data: doc } = await supabase
    .from('documents')
    .select('id, title, document_type, status, period_start, period_end, current_version_id, published_at, business_entity_id, business_entities ( id, name, currency )')
    .eq('id', id)
    .maybeSingle();
  if (!doc) notFound();

  // The side that reads every tenant's unpublished figures must be audited too:
  // firm_staff holds no write permission, so without this a read-only firm
  // account leaves no trace at all (docs/SECURITY.md incident response).
  await logAccess({
    action: 'admin.document.view',
    resourceType: 'document',
    resourceId: doc.id,
    businessEntityId: doc.business_entity_id,
  });

  // The newest uploaded version, which is what the firm reviews next — not
  // necessarily the one the client is seeing. Same helper publishBlockers uses,
  // so the page and the Publish button can never disagree about the target.
  const versionId = await reviewVersion(supabase, doc.id, doc.current_version_id);
  const [{ data: versions }, { data: pages }, { data: reports }, { data: statements }, blockers, removal] =
    await Promise.all([
      supabase
        .from('document_versions')
        .select('id, version_no, original_filename, size_bytes, sha256, page_count, upload_status, reject_code, created_at')
        .eq('document_id', id)
        .order('version_no', { ascending: false }),
      versionId
        ? supabase.from('document_pages').select('page_number, kind, report_type, period_start, period_end, confidence').eq('document_version_id', versionId).order('page_number')
        : Promise.resolve({ data: [] }),
      versionId
        ? supabase.from('financial_reports').select('id, report_type, basis, currency, period_start, period_end, status, reconciliation').eq('document_version_id', versionId).order('report_type')
        : Promise.resolve({ data: [] }),
      versionId
        ? supabase.from('bank_statements').select('id, period_start, period_end, beginning_balance, ending_balance, status, reconciliation, bank_accounts ( institution, masked_number, currency )').eq('document_version_id', versionId)
        : Promise.resolve({ data: [] }),
      publishBlockers(supabase, id),
      deleteBlockers(supabase, id),
    ]);

  const versionIds = (versions ?? []).map((v) => v.id);
  const reportIds = (reports ?? []).map((r) => r.id);
  const statementIds = (statements ?? []).map((s) => s.id);
  const [{ data: jobs }, { data: lines }, { data: transactions }, history] = await Promise.all([
    versionIds.length
      ? supabase.from('document_processing_jobs').select('id, document_version_id, status, step, attempts, max_attempts, error_code, updated_at').in('document_version_id', versionIds).order('updated_at', { ascending: false })
      : Promise.resolve({ data: [] }),
    reportIds.length
      ? supabase.from('financial_statement_lines').select('id, report_id, depth, section, account_name, account_number, current, prior, is_section, is_total, page_number, confidence, corrected_at, position').in('report_id', reportIds).order('position')
      : Promise.resolve({ data: [] }),
    statementIds.length
      ? supabase.from('bank_transactions').select('id, bank_statement_id, txn_date, description, debit, credit, running_balance, page_number, confidence').in('bank_statement_id', statementIds).order('txn_date').limit(500)
      : Promise.resolve({ data: [] }),
    loadDerivedHistory(supabase, (versions ?? []).map((v) => ({ id: v.id, versionNo: v.version_no }))),
  ]);

  const canEdit = firm.role === 'master_admin';
  const versionNo = new Map((versions ?? []).map((v) => [v.id, v.version_no]));
  const dayFmt = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });
  const currency = doc.business_entities?.currency ?? 'USD';

  return (
    <main className="mx-auto w-full max-w-[1200px] px-6 py-10 md:px-10">
      <Link href="/admin/documents" className="text-muted-foreground hover:text-ink inline-flex items-center gap-1 text-[13.5px] font-medium">
        <ChevronLeft className="size-4" aria-hidden="true" />
        {t('backToDocuments')}
      </Link>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-ink flex flex-wrap items-center gap-3 text-[28px] font-bold tracking-[-0.01em]">
            {doc.title}
            <span className={statusPill(doc.status)}>{t(`status_${doc.status}`)}</span>
          </h1>
          <p className="text-muted-foreground mt-1.5 text-[15px]">
            <Link href={`/admin/entities/${doc.business_entity_id}`} className="hover:text-blue font-medium">
              {doc.business_entities?.name ?? '—'}
            </Link>
            {' · '}
            {t(`type_${doc.document_type}`)}
            {doc.period_start && doc.period_end ? ` · ${formatPeriod(doc.period_start, doc.period_end, locale)}` : ''}
            {doc.published_at ? ` · ${t('publishedAt')} ${dayFmt.format(new Date(doc.published_at))}` : ''}
          </p>
        </div>
        <JobActions
          documentId={doc.id}
          versionId={versionId ?? versions?.[0]?.id ?? null}
          job={jobs?.[0] ? { id: jobs[0].id, status: jobs[0].status } : null}
          canEdit={canEdit}
        />
      </div>

      <div className="mt-6">
        <PublishBar documentId={doc.id} status={doc.status} blockers={blockers.blockers} canEdit={canEdit} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <section className={card}>
          <h2 className="text-ink mb-4 text-[17px] font-semibold">{t('metaTitle')}</h2>
          <DocumentMetaForm
            documentId={doc.id}
            initial={{
              documentType: asDocumentType(doc.document_type),
              title: doc.title,
              periodStart: doc.period_start ?? '',
              periodEnd: doc.period_end ?? '',
            }}
            canEdit={canEdit && doc.status !== 'published'}
          />
        </section>
        <section className={`${card} overflow-x-auto`}>
          <h2 className="text-ink mb-4 text-[17px] font-semibold">{t('reviewPages')}</h2>
          <PagesTable
            pages={(pages ?? []).map((p) => ({
              pageNumber: p.page_number,
              kind: p.kind,
              reportType: p.report_type,
              periodStart: p.period_start,
              periodEnd: p.period_end,
              confidence: p.confidence,
            }))}
          />
        </section>
      </div>

      {(reports ?? []).length === 0 && (statements ?? []).length === 0 && (
        <p className="text-muted-foreground mt-6 text-[14px]">{t('noExtraction')}</p>
      )}

      {(reports ?? []).map((r) => (
        <section key={r.id} className={`${card} mt-6`}>
          <h2 className="text-ink mb-4 text-[17px] font-semibold">{t('extractedTitle')}</h2>
          <StatementReview
            report={{
              id: r.id,
              reportType: r.report_type,
              basis: r.basis,
              currency: r.currency,
              periodStart: r.period_start,
              periodEnd: r.period_end,
              status: r.status,
              reconciliation: parseReconciliation(r.reconciliation),
            }}
            lines={(lines ?? [])
              .filter((l) => l.report_id === r.id)
              .map((l) => ({
                id: l.id,
                depth: l.depth,
                section: l.section,
                accountName: l.account_name,
                accountNumber: l.account_number,
                current: l.current,
                prior: l.prior,
                isSection: l.is_section,
                isTotal: l.is_total,
                pageNumber: l.page_number,
                confidence: l.confidence,
                correctedAt: l.corrected_at,
              }))}
            canEdit={canEdit}
          />
        </section>
      ))}

      {(statements ?? []).map((s) => (
        <section key={s.id} className={`${card} mt-6`}>
          <h2 className="text-ink mb-4 text-[17px] font-semibold">{t('bankTitle')}</h2>
          <BankReview
            statement={{
              id: s.id,
              institution: s.bank_accounts?.institution ?? '—',
              maskedNumber: s.bank_accounts?.masked_number ?? '',
              periodStart: s.period_start,
              periodEnd: s.period_end,
              beginningBalance: s.beginning_balance,
              endingBalance: s.ending_balance,
              status: s.status,
              reconciliation: parseReconciliation(s.reconciliation),
              currency: s.bank_accounts?.currency ?? currency,
            }}
            transactions={(transactions ?? [])
              .filter((tx) => tx.bank_statement_id === s.id)
              .map((tx) => ({
                id: tx.id,
                date: tx.txn_date,
                description: tx.description,
                debit: tx.debit,
                credit: tx.credit,
                runningBalance: tx.running_balance,
                pageNumber: tx.page_number,
                confidence: tx.confidence,
              }))}
          />
        </section>
      ))}

      <ReportHistory rows={history} />

      <VersionsJobs
        currentVersionId={versionId}
        versions={(versions ?? []).map((v) => ({
          id: v.id,
          versionNo: v.version_no,
          originalFilename: v.original_filename,
          sizeBytes: v.size_bytes,
          sha256: v.sha256,
          pageCount: v.page_count,
          uploadStatus: v.upload_status,
          rejectCode: v.reject_code,
          createdAt: v.created_at,
        }))}
        jobs={(jobs ?? []).map((j) => ({
          id: j.id,
          versionNo: versionNo.get(j.document_version_id) ?? null,
          status: j.status,
          step: j.step,
          attempts: j.attempts,
          maxAttempts: j.max_attempts,
          errorCode: j.error_code,
          updatedAt: j.updated_at,
        }))}
      />

      {/* Last on the page and visually apart: the only irreversible control in
          the firm portal. It refuses a published document and one that
          published figures still derive from — the database enforces both. */}
      <DeleteDocumentBar
        documentId={doc.id}
        clientPath={`/admin/entities/${doc.business_entity_id}`}
        blockers={removal.blockers}
        derivedCount={removal.derivedCount}
        canEdit={canEdit}
      />
    </main>
  );
}
