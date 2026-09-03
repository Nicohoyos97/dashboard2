'use client';

import { FileUp, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';

import { Link } from '@/i18n/navigation';
import { createDocumentDraft, finalizeDocumentUpload } from '@/lib/documents/actions';
import {
  DOCUMENT_TYPES,
  type DocumentType,
  MAX_UPLOAD_BYTES,
  type UploadMimeType,
  defaultDocumentType,
} from '@/lib/documents/types';
import { createClient } from '@/lib/supabase/client';

import { card, inputClass, labelClass, primaryButton, selectClass } from './ui';

export type UploaderClient = { id: string; name: string; entities: { id: string; name: string }[] };
export type ReplaceTarget = { documentId: string; clientId: string; entityId: string; title: string };

type Item = {
  key: string;
  file: File;
  mime: UploadMimeType;
  documentType: DocumentType;
  title: string;
  periodStart: string;
  periodEnd: string;
  state: 'ready' | 'uploading' | 'finalizing' | 'done' | 'error';
  message?: string | undefined;
  documentId?: string;
};

function mimeOf(file: File): UploadMimeType | null {
  const name = file.name.toLowerCase();
  if (file.type === 'application/pdf' || name.endsWith('.pdf')) return 'application/pdf';
  if (file.type === 'text/csv' || name.endsWith('.csv')) return 'text/csv';
  return null;
}

// Guided uploader (INITIAL_PROMPT.md §8): client → business → files. Bytes go
// straight from the browser to the private bucket; the server only reserves
// the rows first and validates afterwards (docs/PLAN.md §3.3).
export function Uploader({ clients, replace }: { clients: UploaderClient[]; replace?: ReplaceTarget }) {
  const t = useTranslations('Admin');
  const fileInput = useRef<HTMLInputElement>(null);
  const [clientId, setClientId] = useState(replace?.clientId ?? '');
  const [entityId, setEntityId] = useState(replace?.entityId ?? '');
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
  const entities = clients.find((c) => c.id === clientId)?.entities ?? [];

  function addFiles(list: FileList | File[]) {
    const next: Item[] = [];
    for (const file of Array.from(list)) {
      const mime = mimeOf(file);
      const base = {
        key: `${file.name}-${file.size}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        file,
        title: file.name.replace(/\.(pdf|csv)$/i, ''),
        periodStart: '',
        periodEnd: '',
      };
      if (!mime) next.push({ ...base, mime: 'application/pdf', documentType: 'other_report', state: 'error', message: t('fileBadType') });
      else if (file.size > MAX_UPLOAD_BYTES) next.push({ ...base, mime, documentType: defaultDocumentType(mime), state: 'error', message: t('fileTooLarge') });
      else next.push({ ...base, mime, documentType: defaultDocumentType(mime), state: 'ready' });
    }
    setItems((prev) => [...prev, ...next]);
  }

  function patch(key: string, changes: Partial<Item>) {
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, ...changes } : i)));
  }

  async function uploadOne(item: Item): Promise<void> {
    patch(item.key, { state: 'uploading', message: undefined });
    const draft = await createDocumentDraft({
      entityId,
      ...(replace ? { documentId: replace.documentId } : {}),
      documentType: item.documentType,
      title: item.title.trim() || item.file.name,
      periodStart: item.periodStart || undefined,
      periodEnd: item.periodEnd || undefined,
      filename: item.file.name,
      sizeBytes: item.file.size,
      mimeType: item.mime,
    });
    if (!draft.ok) return patch(item.key, { state: 'error', message: draft.error });

    const { error } = await createClient()
      .storage.from('documents')
      .upload(draft.value.storagePath, item.file, { contentType: item.mime, upsert: false });
    if (error) return patch(item.key, { state: 'error', message: t('uploadFailed') });

    patch(item.key, { state: 'finalizing' });
    const done = await finalizeDocumentUpload({ versionId: draft.value.versionId });
    if (!done.ok) return patch(item.key, { state: 'error', message: done.error });
    patch(item.key, { state: 'done', documentId: done.value.documentId });
  }

  async function uploadAll() {
    setBusy(true);
    for (const item of items.filter((i) => i.state === 'ready')) await uploadOne(item);
    setBusy(false);
  }

  const readyCount = items.filter((i) => i.state === 'ready').length;

  return (
    <div className="flex flex-col gap-6">
      {replace && (
        <p role="status" className="bg-blue-pale text-ink rounded-xl px-4 py-3 text-[14px]">
          {t('replacingDocument', { title: replace.title })}
        </p>
      )}
      <div className={`${card} grid gap-5 md:grid-cols-2`}>
        <div>
          <label htmlFor="uploadClient" className={labelClass}>{t('stepClient')}</label>
          <select id="uploadClient" value={clientId} disabled={!!replace} onChange={(e) => { setClientId(e.target.value); setEntityId(''); }} className={selectClass}>
            <option value="">{t('selectClient')}</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="uploadEntity" className={labelClass}>{t('stepBusiness')}</label>
          <select id="uploadEntity" value={entityId} disabled={!clientId || !!replace} onChange={(e) => setEntityId(e.target.value)} className={selectClass}>
            <option value="">{t('selectBusiness')}</option>
            {entities.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </div>
      </div>

      <section className={card}>
        <p className={labelClass}>{t('stepFiles')}</p>
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); if (entityId) addFiles(e.dataTransfer.files); }}
          className={`border-line flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 text-center ${entityId ? 'bg-paper' : 'bg-secondary opacity-60'}`}
        >
          <FileUp className="text-blue size-8" aria-hidden="true" />
          <p className="text-muted-foreground text-[14px]">
            {t('dropzone')}{' '}
            <button type="button" disabled={!entityId} onClick={() => fileInput.current?.click()} className="text-blue font-semibold underline-offset-2 hover:underline disabled:cursor-not-allowed">
              {t('browse')}
            </button>
          </p>
          <input ref={fileInput} id="uploadFiles" type="file" multiple accept=".pdf,.csv,application/pdf,text/csv" className="sr-only" onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ''; }} />
        </div>

        {items.length > 0 && (
          <ul className="divide-line mt-5 divide-y">
            {items.map((item) => (
              <li key={item.key} className="grid gap-3 py-4 md:grid-cols-[1.4fr_1fr_1fr_1fr_auto]">
                <div>
                  <label htmlFor={`title-${item.key}`} className="text-muted-foreground mb-1 block text-[12px] font-medium">{t('fileTitle')}</label>
                  <input id={`title-${item.key}`} value={item.title} disabled={item.state !== 'ready'} onChange={(e) => patch(item.key, { title: e.target.value })} className={`${inputClass} h-10`} />
                  <p className="text-muted-foreground mt-1 truncate text-[12px]">{item.file.name} · {(item.file.size / 1024).toFixed(0)} KB</p>
                </div>
                <div>
                  <label htmlFor={`type-${item.key}`} className="text-muted-foreground mb-1 block text-[12px] font-medium">{t('fileType')}</label>
                  <select id={`type-${item.key}`} value={item.documentType} disabled={item.state !== 'ready'} onChange={(e) => patch(item.key, { documentType: e.target.value as DocumentType })} className={`${selectClass} h-10`}>
                    {DOCUMENT_TYPES.map((d) => <option key={d} value={d}>{t(`type_${d}`)}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor={`start-${item.key}`} className="text-muted-foreground mb-1 block text-[12px] font-medium">{t('periodStart')}</label>
                  <input id={`start-${item.key}`} type="date" value={item.periodStart} disabled={item.state !== 'ready'} onChange={(e) => patch(item.key, { periodStart: e.target.value })} className={`${inputClass} h-10`} />
                </div>
                <div>
                  <label htmlFor={`end-${item.key}`} className="text-muted-foreground mb-1 block text-[12px] font-medium">{t('periodEnd')}</label>
                  <input id={`end-${item.key}`} type="date" value={item.periodEnd} disabled={item.state !== 'ready'} onChange={(e) => patch(item.key, { periodEnd: e.target.value })} className={`${inputClass} h-10`} />
                </div>
                <div className="flex items-end justify-end gap-2 text-[13px]">
                  {item.state === 'ready' && (
                    <button type="button" aria-label={t('removeFile')} onClick={() => setItems((prev) => prev.filter((i) => i.key !== item.key))} className="text-muted-foreground hover:text-danger inline-flex size-10 items-center justify-center rounded-lg">
                      <Trash2 className="size-4" aria-hidden="true" />
                    </button>
                  )}
                  {item.state === 'uploading' && <span className="text-muted-foreground">{t('uploadingFile')}</span>}
                  {item.state === 'finalizing' && <span className="text-muted-foreground">{t('finalizing')}</span>}
                  {item.state === 'done' && (
                    <span className="text-success flex flex-col items-end gap-1 font-medium">
                      {t('uploadedOk')}
                      {item.documentId && <Link href={`/admin/documents/${item.documentId}`} className="text-blue underline-offset-2 hover:underline">{t('review')}</Link>}
                    </span>
                  )}
                  {item.state === 'error' && <span role="alert" className="text-danger max-w-[220px] text-right">{item.message}</span>}
                </div>
              </li>
            ))}
          </ul>
        )}

        {readyCount > 0 && (
          <div className="mt-5 flex justify-end">
            <button type="button" disabled={busy || !entityId} onClick={uploadAll} className={primaryButton}>
              {busy ? t('uploadingFile') : t('uploadAll', { count: readyCount })}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
