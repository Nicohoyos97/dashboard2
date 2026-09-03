'use client';

import { CheckCircle2, EyeOff } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';

import { useRouter } from '@/i18n/navigation';
import { type PublishBlocker, publishDocument, unpublishDocument } from '@/lib/documents/publish';

import { primaryButton, secondaryButton } from '../ui';

// Publish / unpublish with a two-step confirmation. Blockers come from the
// server (publishBlockers) and are shown instead of a disabled mystery button.
export function PublishBar({
  documentId,
  status,
  blockers,
  canEdit,
}: {
  documentId: string;
  status: string;
  blockers: PublishBlocker[];
  canEdit: boolean;
}) {
  const t = useTranslations('Admin');
  const router = useRouter();
  const [confirm, setConfirm] = useState<'publish' | 'unpublish' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const published = status === 'published';

  function run(kind: 'publish' | 'unpublish') {
    if (confirm !== kind) return setConfirm(kind);
    setConfirm(null);
    setError(null);
    startTransition(async () => {
      const res = kind === 'publish' ? await publishDocument({ documentId }) : await unpublishDocument({ documentId });
      if (!res.ok) return setError(res.error);
      router.refresh();
    });
  }

  if (!canEdit) return null;

  return (
    <div className="border-line bg-card flex flex-wrap items-center gap-4 rounded-2xl border p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="min-w-0 flex-1">
        {published ? (
          <p className="text-success flex items-center gap-2 text-[14px] font-medium">
            <CheckCircle2 className="size-4" aria-hidden="true" />
            {t('publishedNote')}
          </p>
        ) : blockers.length > 0 ? (
          <ul className="text-muted-foreground flex flex-col gap-1 text-[13.5px]">
            {blockers.map((b) => (
              <li key={b}>{t(b)}</li>
            ))}
          </ul>
        ) : (
          <p className="text-ink text-[14px] font-medium">{t('status_ready_to_publish')}</p>
        )}
        {error && (
          <p role="alert" className="text-danger mt-2 text-[13.5px]">
            {error}
          </p>
        )}
      </div>
      {published ? (
        <button type="button" disabled={isPending} onClick={() => run('unpublish')} className={secondaryButton}>
          <EyeOff className="size-4" aria-hidden="true" />
          {confirm === 'unpublish' ? t('confirmUnpublish') : t('unpublish')}
        </button>
      ) : (
        <button
          type="button"
          disabled={isPending || blockers.length > 0}
          onClick={() => run('publish')}
          className={primaryButton}
        >
          <CheckCircle2 className="size-4" aria-hidden="true" />
          {confirm === 'publish' ? t('confirmPublish') : t('publish')}
        </button>
      )}
    </div>
  );
}
