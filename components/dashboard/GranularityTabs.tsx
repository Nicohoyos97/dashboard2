'use client';

import { useLocale, useTranslations } from 'next-intl';

import { usePathname, useRouter } from '@/i18n/navigation';
import type { GranularityChoice } from '@/lib/portal/granularity';

// Month · Quarter · Year. A granularity no published source covers stays
// visible but disabled with the reason (spec §14.13) instead of being hidden —
// a client who expects monthly figures should learn why there are none, not
// wonder where the control went. Disabled tabs carry `aria-disabled` rather
// than `disabled` so they keep focus and can announce that explanation.
export function GranularityTabs({ choices }: { choices: GranularityChoice[] }) {
  const t = useTranslations('Overview');
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  const unavailable = choices.filter((choice) => !choice.enabled);
  if (unavailable.length === choices.length) return null;

  const noteId = 'granularity-note';
  const kinds = new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' }).format(
    unavailable.map((choice) => t(`granularity_${choice.kind}`)),
  );

  return (
    <div className="flex flex-col items-start gap-1">
      <div role="group" aria-label={t('granularityLabel')} className="border-line bg-secondary inline-flex rounded-xl border p-0.5">
        {choices.map((choice) => (
          <button
            key={choice.kind}
            type="button"
            aria-pressed={choice.selected}
            {...(choice.enabled ? {} : { 'aria-disabled': true, 'aria-describedby': noteId })}
            onClick={() => {
              if (choice.enabled && choice.value) router.push(`${pathname}?period=${choice.value}`);
            }}
            className={`rounded-[10px] px-3 py-1.5 text-[13px] font-medium transition-colors ${
              choice.selected ? 'bg-card text-ink shadow-[0_1px_2px_rgba(15,23,42,0.06)]' : 'text-muted-foreground'
            } ${choice.enabled ? 'hover:text-ink cursor-pointer' : 'cursor-not-allowed opacity-55'} focus-visible:ring-blue/40 outline-none focus-visible:ring-3`}
          >
            {t(`granularity_${choice.kind}`)}
          </button>
        ))}
      </div>
      {unavailable.length > 0 && (
        <p id={noteId} className="text-muted-foreground max-w-[260px] text-[12px] leading-[1.4]">
          {t('granularityUnavailable', { kinds })}
        </p>
      )}
    </div>
  );
}
