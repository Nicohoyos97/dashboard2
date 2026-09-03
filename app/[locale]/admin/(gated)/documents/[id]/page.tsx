// Document review page. Phase 2 step 1: identity, versions and processing
// jobs. The extraction review (page classification, statement lines with
// corrections, reconciliation, publish) is added once the pipeline lands.
import { ChevronLeft } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';

import { card, statusPill } from '@/components/admin/ui';
import { Link } from '@/i18n/navigation';
import { requireFirmMember } from '@/lib/auth/requireFirm';
import { createClient } from '@/lib/supabase/server';

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export default async function DocumentReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const [, t, locale, { id }] = await Promise.all([
    requireFirmMember(),
    getTranslations('Admin'),
    getLocale(),
    params,
  ]);
  const supabase = await createClient();
  const [{ data: doc }, { data: versions }, { data: jobs }] = await Promise.all([
    supabase
      .from('documents')
      .select(
        'id, title, document_type, status, period_start, period_end, current_version_id, published_at, business_entity_id, business_entities ( id, name )',
      )
      .eq('id', id)
      .maybeSingle(),
    supabase
      .from('document_versions')
      .select('id, version_no, original_filename, size_bytes, sha256, page_count, upload_status, reject_code, created_at')
      .eq('document_id', id)
      .order('version_no', { ascending: false }),
    supabase
      .from('document_processing_jobs')
      .select('id, document_version_id, status, step, attempts, max_attempts, error_code, updated_at')
      .in('document_version_id', []) // replaced below once versions are known
      .limit(0),
  ]);
  if (!doc) notFound();

  const versionIds = (versions ?? []).map((v) => v.id);
  const { data: jobRows } = versionIds.length
    ? await supabase
        .from('document_processing_jobs')
        .select('id, document_version_id, status, step, attempts, max_attempts, error_code, updated_at')
        .in('document_version_id', versionIds)
        .order('updated_at', { ascending: false })
    : { data: jobs };

  const dateFmt = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' });
  const dayFmt = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });
  const versionNo = new Map((versions ?? []).map((v) => [v.id, v.version_no]));

  return (
    <main className="mx-auto w-full max-w-[1200px] px-6 py-10 md:px-10">
      <Link
        href="/admin/documents"
        className="text-muted-foreground hover:text-ink inline-flex items-center gap-1 text-[13.5px] font-medium"
      >
        <ChevronLeft className="size-4" aria-hidden="true" />
        {t('backToDocuments')}
      </Link>

      <div className="mt-3">
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
          {doc.period_start && doc.period_end
            ? ` · ${dayFmt.format(new Date(doc.period_start))} – ${dayFmt.format(new Date(doc.period_end))}`
            : ''}
        </p>
      </div>

      <section className={`${card} mt-8 overflow-x-auto p-0`}>
        <h2 className="text-ink px-6 pt-5 text-[17px] font-semibold">{t('versionsTitle')}</h2>
        <table className="mt-3 w-full text-left text-[13.5px]">
          <thead className="text-muted-foreground border-line border-b text-[12px] font-semibold tracking-[0.06em] uppercase">
            <tr>
              <th className="px-6 py-2.5">{t('colVersion')}</th>
              <th className="px-6 py-2.5">{t('colFile')}</th>
              <th className="px-6 py-2.5">{t('colSize')}</th>
              <th className="px-6 py-2.5">{t('colChecksum')}</th>
              <th className="px-6 py-2.5">{t('colUploaded')}</th>
            </tr>
          </thead>
          <tbody className="divide-line divide-y">
            {(versions ?? []).map((v) => (
              <tr key={v.id}>
                <td className="text-ink px-6 py-2.5 font-semibold">
                  v{v.version_no}
                  {v.id === doc.current_version_id && (
                    <span className="bg-blue-pale text-blue ml-2 rounded-full px-2 py-0.5 text-[11px]">{t('current')}</span>
                  )}
                </td>
                <td className="text-ink px-6 py-2.5">
                  {v.original_filename}
                  {v.page_count ? <span className="text-muted-foreground"> · {v.page_count} p.</span> : null}
                  {v.upload_status !== 'uploaded' && (
                    <span className="text-warning ml-2 text-[12px]">{v.upload_status}{v.reject_code ? ` (${v.reject_code})` : ''}</span>
                  )}
                </td>
                <td className="text-muted-foreground px-6 py-2.5">{formatBytes(v.size_bytes)}</td>
                <td className="px-6 py-2.5">
                  <code className="text-muted-foreground text-[12px]">{v.sha256 ? `${v.sha256.slice(0, 12)}…` : '—'}</code>
                </td>
                <td className="text-muted-foreground px-6 py-2.5 whitespace-nowrap">{dateFmt.format(new Date(v.created_at))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className={`${card} mt-6 overflow-x-auto p-0`}>
        <h2 className="text-ink px-6 pt-5 text-[17px] font-semibold">{t('jobsTitle')}</h2>
        {(jobRows ?? []).length === 0 ? (
          <p className="text-muted-foreground px-6 pt-2 pb-5 text-[14px]">{t('noJobs')}</p>
        ) : (
          <table className="mt-3 w-full text-left text-[13.5px]">
            <thead className="text-muted-foreground border-line border-b text-[12px] font-semibold tracking-[0.06em] uppercase">
              <tr>
                <th className="px-6 py-2.5">{t('colVersion')}</th>
                <th className="px-6 py-2.5">{t('statusLabel')}</th>
                <th className="px-6 py-2.5">{t('colStep')}</th>
                <th className="px-6 py-2.5">{t('colAttempts')}</th>
                <th className="px-6 py-2.5">{t('colError')}</th>
                <th className="px-6 py-2.5">{t('updatedAt')}</th>
              </tr>
            </thead>
            <tbody className="divide-line divide-y">
              {(jobRows ?? []).map((j) => (
                <tr key={j.id}>
                  <td className="text-ink px-6 py-2.5 font-semibold">v{versionNo.get(j.document_version_id) ?? '?'}</td>
                  <td className="px-6 py-2.5">
                    <span className={statusPill(j.status === 'succeeded' ? 'published' : j.status)}>{j.status}</span>
                  </td>
                  <td className="text-muted-foreground px-6 py-2.5">{j.step}</td>
                  <td className="text-muted-foreground px-6 py-2.5">{j.attempts}/{j.max_attempts}</td>
                  <td className="px-6 py-2.5">{j.error_code ? <code className="text-danger text-[12px]">{j.error_code}</code> : '—'}</td>
                  <td className="text-muted-foreground px-6 py-2.5 whitespace-nowrap">{dateFmt.format(new Date(j.updated_at))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
