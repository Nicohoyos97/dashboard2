'use client';

import { Download, RotateCcw, Upload } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';

import { Link, useRouter } from '@/i18n/navigation';
import { retryJob } from '@/lib/documents/actions';

import { secondaryButton } from './ui';

// Review-page actions that exist before the extraction UI: download the exact
// original bytes (through the audited signed-URL route) and re-queue a job.
export function JobActions({
  documentId,
  versionId,
  job,
  canEdit,
}: {
  documentId: string;
  versionId: string | null;
  job: { id: string; status: string } | null;
  canEdit: boolean;
}) {
  const t = useTranslations('Admin');
  const router = useRouter();
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex flex-wrap items-center gap-3">
      {versionId && (
        <a href={`/api/documents/${versionId}/download`} className={secondaryButton}>
          <Download className="size-4" aria-hidden="true" />
          {t('downloadOriginal')}
        </a>
      )}
      {canEdit && (
        <Link href={`/admin/upload?document=${documentId}`} className={secondaryButton}>
          <Upload className="size-4" aria-hidden="true" />
          {t('uploadNewVersion')}
        </Link>
      )}
      {canEdit && job && (job.status === 'failed' || job.status === 'succeeded') && (
        <button
          type="button"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              const res = await retryJob({ jobId: job.id });
              setNotice(res.ok ? t('retried') : res.error);
              router.refresh();
            })
          }
          className={secondaryButton}
        >
          <RotateCcw className="size-4" aria-hidden="true" />
          {t('retryJob')}
        </button>
      )}
      {notice && <span className="text-muted-foreground text-[13px]">{notice}</span>}
    </div>
  );
}
