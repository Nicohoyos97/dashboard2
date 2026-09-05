// The shape and starting point of the business half of a provisioning form,
// kept apart from the component that renders it: ClientDialog needs the empty
// value and the type on first paint, but must not pull the form itself — the
// logo uploader alone carries the Supabase browser client — into the clients
// list bundle. See ClientOnboardingFields.
import type { EntityConfigInput } from '@/lib/firm/entities';
import { DEFAULT_TIMEZONE } from '@/lib/utils/timezone';

export type EntityFormValues = Omit<EntityConfigInput, 'clientId'>;

export const EMPTY_BUSINESS: EntityFormValues = {
  name: '',
  legalName: '',
  fiscalYearStartMonth: 1,
  accountingBasis: 'cash',
  currency: 'USD',
  timezone: DEFAULT_TIMEZONE,
  salesTaxEnabled: false,
  enabledModules: { bookkeeping: true, income_taxes: true },
  industry: '',
  logoUrl: null,
};
