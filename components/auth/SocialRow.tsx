'use client';

import { useTranslations } from 'next-intl';
import { useTransition } from 'react';

import { GoogleIcon } from '@/components/icons/GoogleIcon';
import { signInWithGoogle } from '@/lib/auth/actions';

// Google is intentionally the only social provider supported by the product.
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
          className="border-line bg-card text-foreground hover:bg-secondary focus-visible:ring-blue/35 inline-flex h-12 items-center justify-center gap-3 rounded-xl border px-3 text-[14px] font-semibold shadow-sm outline-none transition active:scale-[0.99] focus-visible:ring-4 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Icon className="size-5 shrink-0" />
          <span>{isPending ? t('connecting') : t(labelKey)}</span>
        </button>
      ))}
    </div>
  );
}
