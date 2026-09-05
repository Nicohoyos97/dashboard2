'use client';

import { Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';

import { useRouter } from '@/i18n/navigation';
import { type DeleteBlocker, deleteDocument } from '@/lib/documents/delete';

import { dangerButton } from '../ui';

// Deleting an uploaded document, with the same two-step confirmation as the
// publish bar and the same rule about blockers: say why it cannot be done
// rather than showing a disabled button with no explanation.
//
// Kept visually apart from PublishBar and last on the page. This is the only
// irreversible control in the firm portal — everything else archives,
// supersedes or withdraws — so it should not sit next to the button an admin
// presses every day.
export function DeleteDocumentBar({
  documentId,
  clientPath,
  blockers,
  derivedCount,
  canEdit,
}: {
  documentId: string;
  /** Where to go once the document no longer exists. */
  clientPath: string;
  blockers: DeleteBlocker[];
  derivedCount: number;
  canEdit: boolean;
}) {
  const t = useTranslations('Admin');
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!canEdit) return null;
  const blocked = blockers.length > 0;

  function run() {
    if (!confirm) return setConfirm(true);
    setConfirm(false);
    setError(null);
    startTransition(async () => {
      const res = await deleteDocument({ documentId });
      if (!res.ok) return setError(res.error);
      router.push(clientPath);
    });
  }

  return (
    <section className="border-danger/30 bg-card mt-6 rounded-2xl border p-5">
      <h2 className="text-ink text-[15px] font-semibold">{t('deleteTitle')}</h2>
      <p className="text-muted-foreground mt-1.5 text-[13.5px]">
        {blocked ? t(blockers[0]!, { count: derivedCount }) : t('deleteLede')}
      </p>
      {error && (
        <p role="alert" className="text-danger mt-2 text-[13.5px]">
          {error}
        </p>
      )}
      <div className="mt-4 flex items-center gap-3">
        <button type="button" disabled={isPending || blocked} onClick={run} className={dangerButton}>
          <Trash2 className="size-4" aria-hidden="true" />
          {confirm ? t('deleteConfirm') : t('deleteDocument')}
        </button>
        {confirm && (
          <button type="button" onClick={() => setConfirm(false)} className="text-muted-foreground hover:text-ink text-[13.5px]">
            {t('cancel')}
          </button>
        )}
      </div>
    </section>
  );
}
