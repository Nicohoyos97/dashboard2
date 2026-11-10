'use client';

import { CheckCircle2, EyeOff } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';

import { useRouter } from '@/i18n/navigation';
import { type PublishBlocker, publishDocument, unpublishDocument } from '@/lib/documents/publish';

import { primaryButton, secondaryButton } from '../ui';

// Publish / unpublish with a two-step confirmation. Blockers come from the
// server (publishBlockers) and are shown instead of a disabled mystery button.
//
// A published document can carry a newer version than the one the client sees
// (`pendingVersion`). The server has always accepted publishing it — the
// version swap supersedes the old report in one transaction and the client is
// told the statement was updated — but this bar only offered Unpublish, so the
// firm had to withdraw the month and publish it again: two notifications and a
// moment with no statement at all (Que la creo Burger, October 2026).
export function PublishBar({
  documentId,
  status,
  blockers,
  pendingVersion,
  canEdit,
}: {
  documentId: string;
  status: string;
  blockers: PublishBlocker[];
  /** The newer version waiting behind a published one; null when there is none. */
  pendingVersion: number | null;
  canEdit: boolean;
}) {
  const t = useTranslations('Admin');
  const router = useRouter();
  const [confirm, setConfirm] = useState<'publish' | 'unpublish' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const published = status === 'published';
  const replacing = published && pendingVersion !== null;

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

  const blockerList = (
    <ul className="text-muted-foreground flex flex-col gap-1 text-ui">
      {blockers.map((b) => (
        <li key={b}>{t(b)}</li>
      ))}
    </ul>
  );

  return (
    <div className="border-line bg-card flex flex-wrap items-center gap-4 rounded-2xl border p-5 shadow-card">
      <div className="min-w-0 flex-1">
        {published ? (
          <p className="text-success flex items-center gap-2 text-ui font-medium">
            <CheckCircle2 className="size-4" aria-hidden="true" />
            {t('publishedNote')}
          </p>
        ) : blockers.length > 0 ? (
          blockerList
        ) : (
          <p className="text-ink text-ui font-medium">{t('status_ready_to_publish')}</p>
        )}
        {replacing && (
          <div className="mt-2">
            {blockers.length > 0 ? (
              <>
                <p className="text-ink text-ui font-medium">{t('pendingVersionBlocked', { version: pendingVersion })}</p>
                {blockerList}
              </>
            ) : (
              <p className="text-ink text-ui font-medium">{t('pendingVersionReady', { version: pendingVersion })}</p>
            )}
          </div>
        )}
        {error && (
          <p role="alert" className="text-danger mt-2 text-ui">
            {error}
          </p>
        )}
      </div>
      {published && (
        <button type="button" disabled={isPending} onClick={() => run('unpublish')} className={secondaryButton}>
          <EyeOff className="size-4" aria-hidden="true" />
          {confirm === 'unpublish' ? t('confirmUnpublish') : t('unpublish')}
        </button>
      )}
      {(!published || replacing) && (
        <button
          type="button"
          disabled={isPending || blockers.length > 0}
          onClick={() => run('publish')}
          className={primaryButton}
        >
          <CheckCircle2 className="size-4" aria-hidden="true" />
          {replacing
            ? confirm === 'publish'
              ? t('confirmPublishVersion', { version: pendingVersion })
              : t('publishVersion', { version: pendingVersion })
            : confirm === 'publish'
              ? t('confirmPublish')
              : t('publish')}
        </button>
      )}
    </div>
  );
}
