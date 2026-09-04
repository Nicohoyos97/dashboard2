'use client';

import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';

import { useRouter } from '@/i18n/navigation';
import { answerAccountRequest } from '@/lib/firm/requests';

import { primaryButton, secondaryButton, textareaClass } from './ui';

// Answer one account request. "Complete" records that the firm did the work
// under its own retention rules — nothing here deletes a client's records — and
// the note is what the client reads back in Settings → Data & privacy.
export function RequestActions({ id, status, firmNote, canEdit }: { id: string; status: string; firmNote: string | null; canEdit: boolean }) {
  const t = useTranslations('Admin');
  const router = useRouter();
  const [note, setNote] = useState(firmNote ?? '');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!canEdit) return <p className="text-muted-foreground text-[13px]">{t('requestsStaffReadOnly')}</p>;

  const answer = (next: 'in_progress' | 'completed' | 'declined') =>
    startTransition(async () => {
      setError(null);
      const res = await answerAccountRequest({ id, status: next, firmNote: note });
      if (!res.ok) return setError(res.error);
      router.refresh();
    });

  return (
    <div className="mt-3">
      <label className="text-muted-foreground mb-1.5 block text-[12.5px] font-semibold" htmlFor={`note-${id}`}>
        {t('requestNoteLabel')}
      </label>
      <textarea
        id={`note-${id}`}
        rows={2}
        value={note}
        maxLength={2000}
        placeholder={t('requestNotePlaceholder')}
        onChange={(event) => setNote(event.target.value)}
        className={`${textareaClass} text-[14px]`}
      />
      {error && (
        <p role="alert" className="text-danger mt-2 text-[13.5px]">
          {error}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {status === 'pending' && (
          <button type="button" disabled={isPending} onClick={() => answer('in_progress')} className={secondaryButton}>
            {t('requestStart')}
          </button>
        )}
        <button type="button" disabled={isPending} onClick={() => answer('completed')} className={primaryButton}>
          {t('requestComplete')}
        </button>
        <button type="button" disabled={isPending} onClick={() => answer('declined')} className={secondaryButton}>
          {t('requestDecline')}
        </button>
      </div>
    </div>
  );
}
