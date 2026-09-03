// Guided uploader entry (INITIAL_PROMPT.md §8). master_admin only: firm_staff
// is read-only and is sent back to the dashboard.
import { getTranslations } from 'next-intl/server';

import { type ReplaceTarget, Uploader, type UploaderClient } from '@/components/admin/Uploader';
import { requireFirmAdmin } from '@/lib/auth/requireFirm';
import { createClient } from '@/lib/supabase/server';

export default async function UploadPage({ searchParams }: { searchParams: Promise<{ document?: string }> }) {
  const [, t, params] = await Promise.all([requireFirmAdmin(), getTranslations('Admin'), searchParams]);
  const supabase = await createClient();

  let replace: ReplaceTarget | undefined;
  if (params.document && /^[0-9a-f-]{36}$/i.test(params.document)) {
    const { data: doc } = await supabase
      .from('documents')
      .select('id, title, business_entity_id, business_entities ( client_id )')
      .eq('id', params.document)
      .maybeSingle();
    if (doc?.business_entities) {
      replace = { documentId: doc.id, entityId: doc.business_entity_id, clientId: doc.business_entities.client_id, title: doc.title };
    }
  }
  const { data } = await supabase
    .from('clients')
    .select('id, name, business_entities ( id, name, status )')
    .eq('status', 'active')
    .order('name');

  const clients: UploaderClient[] = (data ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    entities: c.business_entities
      .filter((e) => e.status === 'active')
      .map((e) => ({ id: e.id, name: e.name }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  }));

  return (
    <main className="mx-auto w-full max-w-[1200px] px-6 py-10 md:px-10">
      <h1 className="text-ink text-[28px] font-bold tracking-[-0.01em]">{t('uploadTitle')}</h1>
      <p className="text-muted-foreground mt-1.5 mb-8 max-w-[720px] text-[15px]">{t('uploadLede')}</p>
      <Uploader clients={clients} {...(replace ? { replace } : {})} />
    </main>
  );
}
