import { getTranslations } from 'next-intl/server';

import { ReportTiles } from '@/components/dashboard/ReportTiles';
import { PortalEmpty, PortalPage } from '@/components/portal/PortalPage';
import { logAccess } from '@/lib/audit/logAccess';
import { getCurrentEntity } from '@/lib/auth/getCurrentEntity';
import { loadPublishedDocuments } from '@/lib/portal/load';
import { createClient } from '@/lib/supabase/server';

export default async function ReportsLibraryPage() {
  const [t, entity] = await Promise.all([getTranslations('Overview'), getCurrentEntity()]);
  if (!entity) {
    return (
      <PortalPage title={t('reportsPageTitle')}>
        <PortalEmpty kind="pending" />
      </PortalPage>
    );
  }

  const supabase = await createClient();
  const documents = await loadPublishedDocuments(supabase, entity.id);
  await logAccess({ action: 'reports.library.view', resourceType: 'business_entity', resourceId: entity.id, businessEntityId: entity.id });

  return (
    <PortalPage title={t('reportsPageTitle')} lede={t('reportsPageLede', { business: entity.name })}>
      <section className="border-line bg-card mt-6 rounded-2xl border px-5 py-2 shadow-card">
        <ReportTiles documents={documents} bare />
      </section>
    </PortalPage>
  );
}
