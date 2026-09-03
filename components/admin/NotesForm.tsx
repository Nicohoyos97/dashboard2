'use client';

import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';

import { saveEntityNotes } from '@/lib/firm/entities';

import { primaryButton, textareaClass } from './ui';

export function NotesForm({
  entityId,
  initialNotes,
  canEdit,
}: {
  entityId: string;
  initialNotes: string;
  canEdit: boolean;
}) {
  const t = useTranslations('Admin');
  const [notes, setNotes] = useState(initialNotes);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setSaved(false);
        setError(null);
        startTransition(async () => {
          const res = await saveEntityNotes({ entityId, notes });
          if (!res.ok) return setError(res.error);
          setSaved(true);
        });
      }}
    >
      <textarea
        aria-label={t('notesTitle')}
        rows={5}
        value={notes}
        disabled={!canEdit}
        onChange={(e) => {
          setNotes(e.target.value);
          setSaved(false);
        }}
        className={textareaClass}
      />
      {error && (
        <p role="alert" className="text-danger mt-2 text-[13.5px]">
          {error}
        </p>
      )}
      {canEdit && (
        <div className="mt-3 flex items-center justify-end gap-4">
          {saved && <span className="text-success text-[13.5px] font-medium">{t('saved')}</span>}
          <button type="submit" disabled={isPending} className={primaryButton}>
            {isPending ? t('saving') : t('save')}
          </button>
        </div>
      )}
    </form>
  );
}
