'use client';

import { useTranslations } from 'next-intl';
import { useTransition } from 'react';

import { GoogleIcon } from '@/components/icons/GoogleIcon';
import { signInWithGoogle } from '@/lib/auth/actions';

// Generic provider row. Google-only for the MVP, but the map keeps it trivial
// to add Apple/Facebook in Phase 7 without restructuring.
const PROVIDERS = [
  {
    id: 'google' as const,
    labelKey: 'continueWithGoogle' as const,
    start: signInWithGoogle,
    Icon: GoogleIcon,
  },
];

export function SocialRow({
  redirectTo,
  onError,
}: {
  redirectTo?: string | undefined;
  onError: (message: string) => void;
}) {
  const t = useTranslations('Auth');
  const [isPending, startTransition] = useTransition();

  return (
    <div className="grid grid-cols-1 gap-2.5" role="group">
      {PROVIDERS.map(({ id, labelKey, start, Icon }) => (
        <button
          key={id}
          type="button"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              const res = await start(redirectTo);
              if (res.ok && res.url) {
                window.location.assign(res.url);
              } else if (!res.ok) {
                onError(res.error);
              }
            })
          }
          className="border-line bg-card text-foreground hover:bg-paper inline-flex h-12 items-center justify-center gap-3 rounded-full border px-3 text-[14px] font-semibold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Icon className="size-5 shrink-0" />
          <span>{isPending ? t('connecting') : t(labelKey)}</span>
        </button>
      ))}
    </div>
  );
}
