import { getTranslations } from 'next-intl/server';

export default async function DashboardLoading() {
  const t = await getTranslations('Overview');
  return (
    <main className="mx-auto w-full max-w-[1200px] animate-pulse px-6 py-10 md:px-10" aria-busy="true">
      <div className="bg-secondary h-8 w-64 rounded-lg" />
      <div className="bg-secondary mt-3 h-5 w-80 max-w-full rounded" />
      <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => <div key={index} className="border-line bg-card h-36 rounded-2xl border" />)}
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-[2fr_1fr]">
        <div className="border-line bg-card h-96 rounded-2xl border" />
        <div className="border-line bg-card h-96 rounded-2xl border" />
      </div>
      <span className="sr-only">{t('loading')}</span>
    </main>
  );
}
