import { getTranslations } from 'next-intl/server';

import { ReportTiles } from '@/components/dashboard/ReportTiles';
import { logAccess } from '@/lib/audit/logAccess';
import { getCurrentEntity } from '@/lib/auth/getCurrentEntity';
import { loadPublishedDocuments } from '@/lib/portal/load';
import { createClient } from '@/lib/supabase/server';

export default async function ReportsLibraryPage() {
  const [t, entity] = await Promise.all([getTranslations('Overview'), getCurrentEntity()]);
  if (!entity) {
    return (
      <main className="mx-auto w-full max-w-[1200px] px-6 py-10 md:px-10">
        <h1 className="text-ink text-[28px] font-bold">{t('reportsPageTitle')}</h1>
        <section className="border-line bg-card mt-8 rounded-2xl border p-8">
          <h2 className="text-ink text-[18px] font-semibold">{t('pendingTitle')}</h2>
          <p className="text-muted-foreground mt-2 text-[15px]">{t('pendingBody')}</p>
        </section>
      </main>
    );
  }

  const supabase = await createClient();
  const documents = await loadPublishedDocuments(supabase, entity.id);
  await logAccess({ action: 'reports.library.view', resourceType: 'business_entity', resourceId: entity.id, businessEntityId: entity.id });

  return (
    <main className="mx-auto w-full max-w-[1200px] px-6 py-10 md:px-10">
      <h1 className="text-ink text-[28px] font-bold tracking-[-0.01em]">{t('reportsPageTitle')}</h1>
      <p className="text-muted-foreground mt-1.5 text-[15px]">{t('reportsPageLede', { business: entity.name })}</p>
      <div className="mt-8"><ReportTiles documents={documents} /></div>
    </main>
  );
}
