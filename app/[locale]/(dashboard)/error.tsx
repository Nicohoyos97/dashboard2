'use client';

import { useTranslations } from 'next-intl';

export default function DashboardError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations('Overview');
  return (
    <main className="mx-auto w-full max-w-[1200px] px-6 py-10 md:px-10">
      <section className="border-line bg-card rounded-2xl border p-8 shadow-card">
        <h1 className="text-ink text-stat font-bold">{t('errorTitle')}</h1>
        <p className="text-muted-foreground mt-2 text-body">{t('errorBody')}</p>
        <button type="button" onClick={reset} className="bg-blue hover:bg-blue-hover mt-5 h-10 rounded-lg px-4 text-ui font-semibold text-white">
          {t('retry')}
        </button>
      </section>
    </main>
  );
}
