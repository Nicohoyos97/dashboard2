'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useRef, useState, useTransition } from 'react';

import { usePathname, useRouter } from '@/i18n/navigation';
import { type Locale, routing } from '@/i18n/routing';
import { updateProfile } from '@/lib/settings/actions';
import { createClient } from '@/lib/supabase/client';

const ALLOWED = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_BYTES = 2 * 1024 * 1024; // 2 MB — mirrors the bucket limit

// Native names, not translated ones: a language picker that reads "Spanish" to
// someone who only speaks Spanish is the one label that must never be i18n'd.
const LANGUAGE_NAMES: Record<string, string> = { en: 'English', es: 'Español' };

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '·';
  return (parts[0]![0]! + (parts[1]?.[0] ?? '')).toUpperCase();
}

export function ProfileForm({
  userId,
  initialName,
  initialAvatarUrl,
  initialLocale,
}: {
  userId: string;
  initialName: string;
  initialAvatarUrl: string | null;
  /** Null when the account has never chosen one; the URL's locale is shown. */
  initialLocale: Locale | null;
}) {
  const t = useTranslations('Settings');
  const activeLocale = useLocale() as Locale;
  const router = useRouter();
  const pathname = usePathname();
  const fileInput = useRef<HTMLInputElement>(null);

  const [locale, setLocale] = useState<Locale>(initialLocale ?? activeLocale);
  const [name, setName] = useState(initialName);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(initialAvatarUrl);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    setSaved(false);
    setError(null);
    const f = e.target.files?.[0];
    if (!f) return;
    if (!ALLOWED.includes(f.type)) return setError(t('avatarBadType'));
    if (f.size > MAX_BYTES) return setError(t('avatarTooLarge'));
    setFile(f);
    setPreview(URL.createObjectURL(f));
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaved(false);
    setError(null);
    startTransition(async () => {
      let newAvatarUrl: string | undefined;

      if (file) {
        const supabase = createClient();
        const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
        const path = `${userId}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from('avatars')
          .upload(path, file, { upsert: true, contentType: file.type });
        if (upErr) return setError(t('saveError'));
        newAvatarUrl = supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl;
      }

      const res = await updateProfile({
        fullName: name,
        locale,
        ...(newAvatarUrl ? { avatarUrl: newAvatarUrl } : {}),
      });
      if (!res.ok) return setError(res.error);

      if (newAvatarUrl) setAvatarUrl(newAvatarUrl);
      setFile(null);
      setPreview(null);
      setSaved(true);
      // The whole portal is now in another language, so this page has to be
      // too — and under the prefix that language lives at, or the middleware
      // would bounce the next navigation.
      if (locale !== activeLocale) router.replace(pathname, { locale });
    });
  }

  const shown = preview ?? avatarUrl;

  return (
    <form
      onSubmit={onSubmit}
      className="border-line bg-card mt-6 rounded-2xl border p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
    >
      {/* Avatar */}
      <div className="flex items-center gap-5">
        <div className="border-line bg-secondary relative size-20 overflow-hidden rounded-full border">
          {shown ? (
            // eslint-disable-next-line @next/next/no-img-element -- user-uploaded, arbitrary host
            <img src={shown} alt="" className="size-full object-cover" />
          ) : (
            <span className="text-muted-foreground flex size-full items-center justify-center text-[22px] font-bold">
              {initials(name)}
            </span>
          )}
        </div>
        <div>
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="border-line text-ink hover:bg-secondary rounded-lg border px-3.5 py-2 text-[14px] font-semibold transition"
          >
            {t('avatarChange')}
          </button>
          <p className="text-muted-foreground mt-2 text-[12.5px]">{t('avatarHint')}</p>
          <input
            ref={fileInput}
            type="file"
            accept={ALLOWED.join(',')}
            onChange={onPick}
            className="hidden"
          />
        </div>
      </div>

      {/* Name */}
      <div className="mt-6">
        <label htmlFor="fullName" className="text-ink mb-1.5 block text-[14px] font-semibold">
          {t('fullNameLabel')}
        </label>
        <input
          id="fullName"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setSaved(false);
          }}
          autoComplete="name"
          className="border-line bg-card text-foreground placeholder:text-muted-foreground/60 focus:border-blue h-11 w-full rounded-lg border px-4 text-[15px] transition outline-none focus:shadow-[0_0_0_4px_rgba(37,99,235,0.12)]"
        />
      </div>

      {/* Language */}
      <div className="mt-6">
        <label htmlFor="locale" className="text-ink mb-1.5 block text-[14px] font-semibold">
          {t('languageLabel')}
        </label>
        <select
          id="locale"
          value={locale}
          onChange={(e) => {
            setLocale(e.target.value as Locale);
            setSaved(false);
          }}
          className="border-line bg-card text-foreground focus:border-blue h-11 w-full rounded-lg border px-4 text-[15px] transition outline-none focus:shadow-[0_0_0_4px_rgba(37,99,235,0.12)]"
        >
          {routing.locales.map((option) => (
            <option key={option} value={option}>
              {LANGUAGE_NAMES[option] ?? option}
            </option>
          ))}
        </select>
        <p className="text-muted-foreground mt-2 text-[12.5px]">{t('languageHelp')}</p>
      </div>

      {error && (
        <p role="alert" className="text-danger mt-4 text-[13.5px]">
          {error}
        </p>
      )}

      <div className="mt-6 flex items-center justify-end gap-4">
        {saved && <span className="text-success text-[13.5px] font-medium">{t('saved')}</span>}
        <button
          type="submit"
          disabled={isPending || name.trim().length === 0}
          className="bg-blue hover:bg-blue-soft inline-flex h-11 items-center justify-center rounded-lg px-5 text-[14px] font-semibold text-white transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? t('saving') : t('save')}
        </button>
      </div>
    </form>
  );
}
