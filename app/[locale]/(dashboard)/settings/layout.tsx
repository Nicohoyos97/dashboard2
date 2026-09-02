// Settings shell: page title + left sub-nav + content area. Sits inside the
// authenticated (dashboard) shell (sidebar + guard).
import { getTranslations } from 'next-intl/server';

import { SettingsNav } from '@/components/settings/SettingsNav';

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations('Settings');
  return (
    <div className="mx-auto w-full max-w-[960px] px-6 py-10 md:px-10">
      <h1 className="text-ink text-[28px] font-bold tracking-[-0.01em]">{t('title')}</h1>
      <div className="mt-8 flex flex-col gap-8 md:flex-row md:gap-10">
        <SettingsNav />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
