'use client';

// The two sections that only a *new* client needs: their first business, and
// the invitation that lets them in.
//
// Loaded on demand by ClientDialog (next/dynamic). The clients list is the
// page a firm admin lands on, and this form — the timezone list, the logo
// uploader and the Supabase client it carries — is one click away rather than
// part of that first paint. Without the split the list page went 10 kB over
// its bundle budget, for a form most visits never open.
import { useTranslations } from 'next-intl';

import { BusinessFields } from './BusinessFields';
import type { EntityFormValues } from './business-form';
import { InviteFields, type InviteValues } from './ClientFields';

export function ClientOnboardingFields({
  business,
  invite,
  onBusinessChange,
  onInviteChange,
  onError,
}: {
  business: EntityFormValues;
  invite: InviteValues;
  onBusinessChange: (values: EntityFormValues) => void;
  onInviteChange: (values: InviteValues) => void;
  onError: (message: string | null) => void;
}) {
  const t = useTranslations('Admin');
  return (
    <>
      <Section title={t('onboardingBusinessSection')} />
      <BusinessFields
        values={business}
        onChange={onBusinessChange}
        onError={onError}
        idPrefix="onboarding-"
      />
      <Section title={t('onboardingAccessSection')} />
      <InviteFields values={invite} onChange={onInviteChange} />
    </>
  );
}

function Section({ title }: { title: string }) {
  return (
    <h3 className="text-muted-foreground border-line mt-2 border-t pt-4 text-[11px] font-semibold tracking-[0.12em] uppercase">
      {title}
    </h3>
  );
}
