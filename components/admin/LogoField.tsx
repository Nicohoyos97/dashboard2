'use client';

import { ImageUp, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';

import { createClient } from '@/lib/supabase/client';

import { secondaryButton } from './ui';

// The client's logo, uploaded straight to the `logos` bucket (0018) and stored
// as its public URL. Same shape as the profile avatar upload, with one
// difference that matters: the bucket only accepts writes from a firm admin, so
// a client cannot change how their own portal is branded.
const ALLOWED = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];
const MAX_BYTES = 2 * 1024 * 1024;
const EXTENSION: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
};

export function LogoField({
  value,
  onChange,
  onError,
}: {
  value: string | null;
  onChange: (url: string | null) => void;
  onError: (message: string | null) => void;
}) {
  const t = useTranslations('Admin');
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function pick(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    onError(null);
    if (!ALLOWED.includes(file.type)) return onError(t('logoBadType'));
    if (file.size > MAX_BYTES) return onError(t('logoTooLarge'));

    setBusy(true);
    const supabase = createClient();
    const path = `${crypto.randomUUID()}/${Date.now()}.${EXTENSION[file.type] ?? 'png'}`;
    const { error } = await supabase.storage
      .from('logos')
      .upload(path, file, { upsert: true, contentType: file.type });
    setBusy(false);
    if (error) return onError(t('logoUploadFailed'));
    onChange(supabase.storage.from('logos').getPublicUrl(path).data.publicUrl);
  }

  return (
    <div className="mt-1.5 flex items-center gap-3">
      {value ? (
        // eslint-disable-next-line @next/next/no-img-element -- a client's own logo, any host shape
        <img
          src={value}
          alt=""
          className="border-line bg-card size-12 rounded-xl border object-contain p-1"
        />
      ) : (
        <div className="border-line text-muted-foreground flex size-12 items-center justify-center rounded-xl border border-dashed">
          <ImageUp className="size-5" aria-hidden="true" />
        </div>
      )}
      <input
        ref={input}
        type="file"
        accept={ALLOWED.join(',')}
        onChange={pick}
        className="sr-only"
        aria-label={t('logoChoose')}
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => input.current?.click()}
        className={secondaryButton}
      >
        {busy ? t('logoUploading') : value ? t('logoReplace') : t('logoChoose')}
      </button>
      {value && (
        <button
          type="button"
          onClick={() => onChange(null)}
          className="text-muted-foreground hover:text-ink inline-flex items-center gap-1 text-[13px]"
        >
          <X className="size-3.5" aria-hidden="true" />
          {t('logoRemove')}
        </button>
      )}
    </div>
  );
}
