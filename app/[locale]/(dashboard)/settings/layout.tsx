// Settings shell: page title + left sub-nav + content area. Sits inside the
// authenticated (dashboard) shell (sidebar + guard).
import { getTranslations } from 'next-intl/server';

import { PageHeading } from '@/components/portal/PortalPage';
import { SettingsNav } from '@/components/settings/SettingsNav';

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations('Settings');
  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 pt-6 pb-12 sm:px-6 md:px-10 md:pt-9">
      <PageHeading title={t('title')} />
      <div className="mt-6 flex flex-col gap-6 md:mt-8 md:flex-row md:gap-10">
        <SettingsNav />
        <div className="min-w-0 max-w-[720px] flex-1">{children}</div>
      </div>
    </div>
  );
}
