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
  hasDba: false,
  dbaName: '',
  fiscalYearStartMonth: 1,
  accountingBasis: 'cash',
  currency: 'USD',
  timezone: DEFAULT_TIMEZONE,
  salesTaxEnabled: false,
  salesTax: { state: '', hasCityTax: false, cities: [] },
  enabledModules: { bookkeeping: true, income_taxes: true },
  industry: '',
  logoUrl: null,
};

/**
 * Whether the business half of a provisioning form is still missing an answer
 * its own rules require: a DBA without its trade name, or sales tax without the
 * state it is collected in. The Server Action and the database refuse the same
 * combinations — this only keeps the firm from making the round trip.
 */
export function businessIncomplete(values: EntityFormValues): boolean {
  if (values.name.trim() === '') return true;
  if (values.hasDba && values.dbaName.trim() === '') return true;
  if (!values.salesTaxEnabled) return false;
  if (values.salesTax.state === '') return true;
  return values.salesTax.hasCityTax && values.salesTax.cities.every((city) => city.trim() === '');
}
