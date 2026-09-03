import { getLocale, getTranslations } from 'next-intl/server';

import { card, statusPill } from '../ui';

export type VersionRow = {
  id: string;
  versionNo: number;
  originalFilename: string;
  sizeBytes: number;
  sha256: string | null;
  pageCount: number | null;
  uploadStatus: string;
  rejectCode: string | null;
  createdAt: string;
};

export type JobRow = {
  id: string;
  versionNo: number | null;
  status: string;
  step: string;
  attempts: number;
  maxAttempts: number;
  errorCode: string | null;
  updatedAt: string;
};

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

// Immutable history: every version ever uploaded and every processing run.
export async function VersionsJobs({
  versions,
  jobs,
  currentVersionId,
}: {
  versions: VersionRow[];
  jobs: JobRow[];
  currentVersionId: string | null;
}) {
  const [t, locale] = await Promise.all([getTranslations('Admin'), getLocale()]);
  const fmt = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' });

  return (
    <>
      <section className={`${card} mt-6 overflow-x-auto p-0`}>
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
            {versions.map((v) => (
              <tr key={v.id}>
                <td className="text-ink px-6 py-2.5 font-semibold">
                  v{v.versionNo}
                  {v.id === currentVersionId && (
                    <span className="bg-blue-pale text-blue ml-2 rounded-full px-2 py-0.5 text-[11px]">{t('current')}</span>
                  )}
                </td>
                <td className="text-ink px-6 py-2.5">
                  {v.originalFilename}
                  {v.pageCount ? <span className="text-muted-foreground"> · {v.pageCount} p.</span> : null}
                  {v.uploadStatus !== 'uploaded' && (
                    <span className="text-warning ml-2 text-[12px]">
                      {v.uploadStatus}
                      {v.rejectCode ? ` (${v.rejectCode})` : ''}
                    </span>
                  )}
                </td>
                <td className="text-muted-foreground px-6 py-2.5">{formatBytes(v.sizeBytes)}</td>
                <td className="px-6 py-2.5">
                  <code className="text-muted-foreground text-[12px]">{v.sha256 ? `${v.sha256.slice(0, 12)}…` : '—'}</code>
                </td>
                <td className="text-muted-foreground px-6 py-2.5 whitespace-nowrap">{fmt.format(new Date(v.createdAt))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className={`${card} mt-6 overflow-x-auto p-0`}>
        <h2 className="text-ink px-6 pt-5 text-[17px] font-semibold">{t('jobsTitle')}</h2>
        {jobs.length === 0 ? (
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
              {jobs.map((j) => (
                <tr key={j.id}>
                  <td className="text-ink px-6 py-2.5 font-semibold">v{j.versionNo ?? '?'}</td>
                  <td className="px-6 py-2.5">
                    <span className={statusPill(j.status === 'succeeded' ? 'published' : j.status)}>{j.status}</span>
                  </td>
                  <td className="text-muted-foreground px-6 py-2.5">{j.step}</td>
                  <td className="text-muted-foreground px-6 py-2.5">{j.attempts}/{j.maxAttempts}</td>
                  <td className="px-6 py-2.5">{j.errorCode ? <code className="text-danger text-[12px]">{j.errorCode}</code> : '—'}</td>
                  <td className="text-muted-foreground px-6 py-2.5 whitespace-nowrap">{fmt.format(new Date(j.updatedAt))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
