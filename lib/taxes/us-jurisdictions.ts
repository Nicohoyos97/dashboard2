// The places a US business collects sales tax in, and the codes we store them
// under (0005's `'US'` / `'US-FL'` / `'US-FL-MIAMI'`, made a CHECK constraint in
// 0024).
//
// States are a closed list because they are one: a firm that types "Ilinois"
// once has two Illinoises in its data forever. Cities are free text, because
// the taxing city is whatever the client's registration says — "City of Niles",
// "Village of Skokie", "Unincorporated Cook County" — and no list of those
// survives contact with a real client roster.

export type UsState = { code: string; name: string };

/** The 50 states, DC and Puerto Rico. Alphabetical by name — the order shown. */
export const US_STATES: readonly UsState[] = [
  { code: 'AL', name: 'Alabama' },
  { code: 'AK', name: 'Alaska' },
  { code: 'AZ', name: 'Arizona' },
  { code: 'AR', name: 'Arkansas' },
  { code: 'CA', name: 'California' },
  { code: 'CO', name: 'Colorado' },
  { code: 'CT', name: 'Connecticut' },
  { code: 'DE', name: 'Delaware' },
  { code: 'DC', name: 'District of Columbia' },
  { code: 'FL', name: 'Florida' },
  { code: 'GA', name: 'Georgia' },
  { code: 'HI', name: 'Hawaii' },
  { code: 'ID', name: 'Idaho' },
  { code: 'IL', name: 'Illinois' },
  { code: 'IN', name: 'Indiana' },
  { code: 'IA', name: 'Iowa' },
  { code: 'KS', name: 'Kansas' },
  { code: 'KY', name: 'Kentucky' },
  { code: 'LA', name: 'Louisiana' },
  { code: 'ME', name: 'Maine' },
  { code: 'MD', name: 'Maryland' },
  { code: 'MA', name: 'Massachusetts' },
  { code: 'MI', name: 'Michigan' },
  { code: 'MN', name: 'Minnesota' },
  { code: 'MS', name: 'Mississippi' },
  { code: 'MO', name: 'Missouri' },
  { code: 'MT', name: 'Montana' },
  { code: 'NE', name: 'Nebraska' },
  { code: 'NV', name: 'Nevada' },
  { code: 'NH', name: 'New Hampshire' },
  { code: 'NJ', name: 'New Jersey' },
  { code: 'NM', name: 'New Mexico' },
  { code: 'NY', name: 'New York' },
  { code: 'NC', name: 'North Carolina' },
  { code: 'ND', name: 'North Dakota' },
  { code: 'OH', name: 'Ohio' },
  { code: 'OK', name: 'Oklahoma' },
  { code: 'OR', name: 'Oregon' },
  { code: 'PA', name: 'Pennsylvania' },
  { code: 'PR', name: 'Puerto Rico' },
  { code: 'RI', name: 'Rhode Island' },
  { code: 'SC', name: 'South Carolina' },
  { code: 'SD', name: 'South Dakota' },
  { code: 'TN', name: 'Tennessee' },
  { code: 'TX', name: 'Texas' },
  { code: 'UT', name: 'Utah' },
  { code: 'VT', name: 'Vermont' },
  { code: 'VA', name: 'Virginia' },
  { code: 'WA', name: 'Washington' },
  { code: 'WV', name: 'West Virginia' },
  { code: 'WI', name: 'Wisconsin' },
  { code: 'WY', name: 'Wyoming' },
];

const BY_CODE = new Map(US_STATES.map((state) => [state.code, state]));

export function isUsStateCode(code: string): boolean {
  return BY_CODE.has(code);
}

/** The name to print for a state code, or null when it is not one of ours. */
export function usStateName(code: string): string | null {
  return BY_CODE.get(code)?.name ?? null;
}

/** `'IL'` → `'US-IL'`. */
export function stateJurisdictionCode(stateCode: string): string {
  return `US-${stateCode}`;
}

/**
 * `'City of Niles'` → `'CITY-OF-NILES'`; accents are folded so "Cañón City" and
 * "Canon City" cannot become two registrations for one place. Returns null when
 * nothing survives — a name of only punctuation is not a city.
 */
export function citySlug(name: string): string | null {
  const slug = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug === '' ? null : slug;
}

/** `('IL', 'City of Niles')` → `'US-IL-CITY-OF-NILES'`, or null for an unusable name. */
export function cityJurisdictionCode(stateCode: string, city: string): string | null {
  const slug = citySlug(city);
  return slug === null ? null : `${stateJurisdictionCode(stateCode)}-${slug}`;
}
