// Settings → Business: name + legal name + address. The (dashboard) layout
// guards the session; here we resolve the current entity server-side and read
// its row for the initial values. canEdit is derived from the caller's role —
// the UI communicates the permission, RLS (entities_owner_update) enforces it.
import { getTranslations } from 'next-intl/server';

import { BusinessForm } from '@/components/settings/BusinessForm';
import { getCurrentEntity } from '@/lib/auth/getCurrentEntity';
import type { Address } from '@/lib/settings/actions';
import { createClient } from '@/lib/supabase/server';

const EMPTY_ADDRESS: Address = {
  line1: '',
  line2: '',
  city: '',
  state: '',
  postal_code: '',
  country: '',
};

export default async function BusinessPage() {
  const t = await getTranslations('Settings');
  const entity = await getCurrentEntity();

  const supabase = await createClient();
  const { data: row } = entity
    ? await supabase
        .from('business_entities')
        .select('name, legal_name, address')
        .eq('id', entity.id)
        .maybeSingle()
    : { data: null };

  const stored = (row?.address ?? {}) as Partial<Address>;
  const address: Address = { ...EMPTY_ADDRESS, ...stored };
  const canEdit = entity ? entity.role === 'client_owner' : false;

  return (
    <section className="max-w-[560px]">
      <p className="text-muted-foreground text-[11px] font-semibold tracking-[0.12em] uppercase">
        {t('bizEyebrow')}
      </p>
      <h2 className="text-ink mt-2 text-[22px] font-bold tracking-[-0.01em]">{t('bizTitle')}</h2>
      <p className="text-muted-foreground mt-1.5 text-[15px]">{t('bizLede')}</p>

      <BusinessForm
        canEdit={canEdit}
        initialName={row?.name ?? entity?.name ?? ''}
        initialLegalName={row?.legal_name ?? ''}
        initialAddress={address}
      />
    </section>
  );
}
