// Help & support (INITIAL_PROMPT.md §7 "Settings, Profile, Help"): how the
// portal works and how to reach the firm. Plain content, no placeholders.
//
// The questions are a disclosure list: nine answers open at once made a page
// of prose that hid the one question the owner came with. The first stays
// open, because it is the one every other answer leans on.
import { ChevronDown, MessageSquareLock } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

import { PortalPage } from '@/components/portal/PortalPage';

const QUESTIONS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as const;

export default async function HelpPage() {
  const t = await getTranslations('Help');
  return (
    <PortalPage title={t('title')} lede={t('lede')}>
      <div className="mt-6 grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
        <section className="border-line bg-card divide-line divide-y rounded-2xl border px-5 shadow-card">
          {QUESTIONS.map((n) => (
            <details key={n} className="group" open={n === '1'}>
              <summary className="text-ink focus-visible:ring-brand/40 flex cursor-pointer list-none items-start justify-between gap-4 rounded-lg py-4 text-title font-semibold outline-none focus-visible:ring-3 [&::-webkit-details-marker]:hidden">
                <span className="min-w-0 text-pretty">{t(`q${n}`)}</span>
                <ChevronDown
                  className="text-muted-foreground mt-0.5 size-5 shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none"
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
              </summary>
              <p className="text-muted-foreground -mt-1 max-w-[68ch] pb-5 text-body leading-[1.6] text-pretty">{t(`a${n}`)}</p>
            </details>
          ))}
        </section>

        <aside className="border-line bg-card flex gap-4 rounded-2xl border p-5 shadow-card">
          <span className="bg-blue-pale text-link flex size-9 shrink-0 items-center justify-center rounded-lg">
            <MessageSquareLock className="size-[18px]" strokeWidth={1.75} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 className="text-ink text-title font-semibold">{t('conversationsTitle')}</h2>
            <p className="text-muted-foreground mt-1.5 text-ui leading-[1.6] text-pretty">{t('conversationsBody')}</p>
          </div>
        </aside>
      </div>
    </PortalPage>
  );
}
