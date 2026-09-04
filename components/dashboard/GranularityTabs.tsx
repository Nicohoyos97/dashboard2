'use client';

import { useTranslations } from 'next-intl';

import { usePathname, useRouter } from '@/i18n/navigation';
import type { GranularityChoice } from '@/lib/portal/granularity';

// Month · Quarter · Year. A granularity no published source covers stays
// visible but disabled instead of being hidden — a client who expects monthly
// figures should not wonder where the control went. Disabled tabs carry
// `aria-disabled` rather than `disabled` so they keep focus.
//
// The sentence that used to sit under these tabs is gone at the owner's
// request. The information is not lost: the period picker now says, per
// option, when no published report covers it, so the explanation lives in one
// place beside the choice it describes rather than twice on the same screen.
export function GranularityTabs({ choices }: { choices: GranularityChoice[] }) {
  const t = useTranslations('Overview');
  const router = useRouter();
  const pathname = usePathname();

  const unavailable = choices.filter((choice) => !choice.enabled);
  if (unavailable.length === choices.length) return null;

  return (
    <div
      role="group"
      aria-label={t('granularityLabel')}
      className="border-line bg-secondary inline-flex rounded-xl border p-0.5"
    >
      {choices.map((choice) => (
        <button
          key={choice.kind}
          type="button"
          aria-pressed={choice.selected}
          {...(choice.enabled ? {} : { 'aria-disabled': true })}
          onClick={() => {
            if (choice.enabled && choice.value) router.push(`${pathname}?period=${choice.value}`);
          }}
          className={`rounded-[10px] px-3 py-1.5 text-[13px] font-medium transition-colors ${
            choice.selected
              ? 'bg-card text-ink shadow-[0_1px_2px_rgba(15,23,42,0.06)]'
              : 'text-muted-foreground'
          } ${choice.enabled ? 'hover:text-ink cursor-pointer' : 'cursor-not-allowed opacity-55'} focus-visible:ring-blue/40 outline-none focus-visible:ring-3`}
        >
          {t(`granularity_${choice.kind}`)}
        </button>
      ))}
    </div>
  );
}
