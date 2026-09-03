// Help & support (INITIAL_PROMPT.md §7 "Settings, Profile, Help"): how the
// portal works and how to reach the firm. Plain content, no placeholders.
import { CircleHelp, MessageSquareLock } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

const QUESTIONS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as const;

export default async function HelpPage() {
  const t = await getTranslations('Help');
  return (
    <main className="mx-auto w-full max-w-[880px] px-6 py-10 md:px-10">
      <h1 className="text-ink text-[28px] font-bold tracking-[-0.01em]">{t('title')}</h1>
      <p className="text-muted-foreground mt-1.5 text-[15px]">{t('lede')}</p>

      <dl className="divide-line mt-8 flex flex-col divide-y">
        {QUESTIONS.map((n) => (
          <div key={n} className="flex gap-4 py-5">
            <span className="bg-blue-pale text-blue mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg">
              <CircleHelp className="size-4" strokeWidth={1.75} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <dt className="text-ink text-[16px] font-semibold">{t(`q${n}`)}</dt>
              <dd className="text-muted-foreground mt-1.5 max-w-[68ch] text-[14.5px] leading-[1.6]">
                {t(`a${n}`)}
              </dd>
            </div>
          </div>
        ))}
      </dl>

      <section className="border-line bg-card mt-6 flex gap-4 rounded-2xl border p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <span className="bg-blue-pale text-blue mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg">
          <MessageSquareLock className="size-4" strokeWidth={1.75} aria-hidden="true" />
        </span>
        <div>
          <h2 className="text-ink text-[16px] font-semibold">{t('conversationsTitle')}</h2>
          <p className="text-muted-foreground mt-1.5 max-w-[68ch] text-[14.5px] leading-[1.6]">
            {t('conversationsBody')}
          </p>
        </div>
      </section>
    </main>
  );
}
