// The sales-tax registration of a business: the state it collects in, and the
// cities under it that levy their own. Written by the firm when it provisions
// or edits a business, read back into the same form, and printed as pills in
// the client's portal.
//
// The rows live in `tax_jurisdictions` (0005, given `tax_type` in 0024) rather
// than in columns on the business, because that is the table an obligation
// already points at: linking a filing to "Illinois" later is then a foreign key
// that is already there, not a migration.
import 'server-only';

import {
  cityJurisdictionCode,
  stateJurisdictionCode,
  usStateName,
} from '@/lib/taxes/us-jurisdictions';
import type { createClient } from '@/lib/supabase/server';

import type { SalesTaxRegistration } from './schemas';

type Db = Awaited<ReturnType<typeof createClient>>;

export const EMPTY_SALES_TAX: SalesTaxRegistration = { state: '', hasCityTax: false, cities: [] };

type JurisdictionRow = { level: 'state' | 'local'; name: string; code: string };

/**
 * The rows a registration describes. Pure, so the code it derives can be tested
 * without a database.
 *
 * Cities are dropped when the firm answered "no city tax" — a city typed and
 * then retracted must not reach the client's portal, the same rule the DBA pair
 * gets from a CHECK constraint. Two spellings that slug to one code ("St. Louis"
 * and "St Louis") collapse to the first: they are one registration, and the
 * unique key would refuse the second anyway.
 */
export function salesTaxRows(
  registration: SalesTaxRegistration,
  enabled: boolean,
): JurisdictionRow[] {
  if (!enabled || registration.state === '') return [];
  const stateName = usStateName(registration.state);
  if (stateName === null) return [];

  const rows: JurisdictionRow[] = [
    { level: 'state', name: stateName, code: stateJurisdictionCode(registration.state) },
  ];
  if (!registration.hasCityTax) return rows;

  for (const entry of registration.cities) {
    const name = entry.trim();
    const code = name === '' ? null : cityJurisdictionCode(registration.state, name);
    if (code !== null && !rows.some((row) => row.code === code)) {
      rows.push({ level: 'local', name, code });
    }
  }
  return rows;
}

/**
 * Makes the stored registration match the one submitted. Returns false when a
 * write failed — the caller has already saved the business, so it says the
 * jurisdictions are missing rather than pretending the whole save failed.
 *
 * Only `tax_type = 'sales'` rows are touched: a business can also be registered
 * with the same state for income tax, and that row is not this form's to delete.
 */
export async function syncSalesTaxJurisdictions(
  supabase: Db,
  entityId: string,
  registration: SalesTaxRegistration,
  enabled: boolean,
): Promise<boolean> {
  const desired = salesTaxRows(registration, enabled);
  const { data, error } = await supabase
    .from('tax_jurisdictions')
    .select('id, level, name, code')
    .eq('business_entity_id', entityId)
    .eq('tax_type', 'sales');
  if (error) return false;
  const existing = data ?? [];

  const wanted = new Set(desired.map((row) => row.code));
  const staleIds = existing.filter((row) => !wanted.has(row.code)).map((row) => row.id);
  if (staleIds.length > 0) {
    const { error: deleteError } = await supabase.from('tax_jurisdictions').delete().in('id', staleIds);
    if (deleteError) return false;
  }

  for (const row of desired) {
    // Matched on the code, so re-typing a city with different punctuation
    // renames the row the client already sees instead of adding a second one.
    const current = existing.find((candidate) => candidate.code === row.code);
    if (current) {
      if (current.name === row.name && current.level === row.level) continue;
      const { error: updateError } = await supabase
        .from('tax_jurisdictions')
        .update({ name: row.name, level: row.level })
        .eq('id', current.id);
      if (updateError) return false;
      continue;
    }
    const { error: insertError } = await supabase.from('tax_jurisdictions').insert({
      business_entity_id: entityId,
      tax_type: 'sales',
      level: row.level,
      name: row.name,
      code: row.code,
    });
    if (insertError) return false;
  }
  return true;
}

/** The stored registration, in the shape the provisioning form edits. */
export async function loadSalesTaxRegistration(
  supabase: Db,
  entityId: string,
): Promise<SalesTaxRegistration> {
  const { data, error } = await supabase
    .from('tax_jurisdictions')
    .select('level, name, code')
    .eq('business_entity_id', entityId)
    .eq('tax_type', 'sales')
    // State first, then its cities by name: the order the form and the portal
    // both show, decided here rather than in each of them.
    .order('level', { ascending: false })
    .order('name');
  if (error || !data) return EMPTY_SALES_TAX;

  const state = data.find((row) => row.level === 'state');
  const cities = data.filter((row) => row.level === 'local').map((row) => row.name);
  return {
    state: state ? state.code.replace(/^US-/, '') : '',
    hasCityTax: cities.length > 0,
    cities,
  };
}
