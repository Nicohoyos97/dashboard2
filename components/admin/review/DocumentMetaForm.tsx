'use client';

import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';

import { useRouter } from '@/i18n/navigation';
import { confirmDocumentMeta } from '@/lib/documents/publish';
import { DOCUMENT_TYPES, type DocumentType } from '@/lib/documents/types';

import { inputClass, labelClass, primaryButton, selectClass } from '../ui';

export function DocumentMetaForm({
  documentId,
  initial,
  canEdit,
}: {
  documentId: string;
  initial: { documentType: DocumentType; title: string; periodStart: string; periodEnd: string };
  canEdit: boolean;
}) {
  const t = useTranslations('Admin');
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setNotice(null);
        startTransition(async () => {
          const res = await confirmDocumentMeta({ documentId, ...values });
          setNotice(res.ok ? { ok: true, text: t('metaSaved') } : { ok: false, text: res.error });
          if (res.ok) router.refresh();
        });
      }}
      className="grid gap-4 sm:grid-cols-2"
    >
      <div className="sm:col-span-2">
        <label htmlFor="metaTitle" className={labelClass}>{t('fileTitle')}</label>
        <input id="metaTitle" value={values.title} disabled={!canEdit} onChange={(e) => setValues((v) => ({ ...v, title: e.target.value }))} className={inputClass} />
      </div>
      <div className="sm:col-span-2">
        <label htmlFor="metaType" className={labelClass}>{t('fileType')}</label>
        <select id="metaType" value={values.documentType} disabled={!canEdit} onChange={(e) => setValues((v) => ({ ...v, documentType: e.target.value as DocumentType }))} className={selectClass}>
          {DOCUMENT_TYPES.map((d) => <option key={d} value={d}>{t(`type_${d}`)}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor="metaStart" className={labelClass}>{t('periodStart')}</label>
        <input id="metaStart" type="date" value={values.periodStart} disabled={!canEdit} onChange={(e) => setValues((v) => ({ ...v, periodStart: e.target.value }))} className={inputClass} />
      </div>
      <div>
        <label htmlFor="metaEnd" className={labelClass}>{t('periodEnd')}</label>
        <input id="metaEnd" type="date" value={values.periodEnd} disabled={!canEdit} onChange={(e) => setValues((v) => ({ ...v, periodEnd: e.target.value }))} className={inputClass} />
      </div>
      {canEdit && (
        <div className="flex items-center justify-end gap-4 sm:col-span-2">
          {notice && (
            <span role={notice.ok ? 'status' : 'alert'} className={`text-[13.5px] ${notice.ok ? 'text-success' : 'text-danger'}`}>
              {notice.text}
            </span>
          )}
          <button type="submit" disabled={isPending || values.title.trim().length === 0} className={primaryButton}>
            {isPending ? t('saving') : t('confirmMeta')}
          </button>
        </div>
      )}
    </form>
  );
}
