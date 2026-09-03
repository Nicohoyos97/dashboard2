'use client';

import { useTranslations } from 'next-intl';

export default function DashboardError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations('Overview');
  return (
    <main className="mx-auto w-full max-w-[1200px] px-6 py-10 md:px-10">
      <section className="border-line bg-card rounded-2xl border p-8 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <h1 className="text-ink text-[22px] font-bold">{t('errorTitle')}</h1>
        <p className="text-muted-foreground mt-2 text-[15px]">{t('errorBody')}</p>
        <button type="button" onClick={reset} className="bg-blue hover:bg-blue-soft mt-5 h-10 rounded-lg px-4 text-[14px] font-semibold text-white">
          {t('retry')}
        </button>
      </section>
    </main>
  );
}
