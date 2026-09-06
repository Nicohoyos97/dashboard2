// Where someone without an account goes.
//
// There is no self-serve sign-up: a portal account exists because a business
// bought a plan and the firm provisioned it (lib/firm/onboarding.ts sends the
// invitation). So "create an account" is a link out to the plans on the
// marketing site, not a form. `start=plans` opens that page straight on the
// plan cards — the "Start today" path — instead of its two-way chooser.
//
// The firm's URL is recorded once, in FIRM; a second copy here is how the two
// would drift.
import { FIRM } from '@/lib/reports/brand';

export function getStartedUrl(locale: string): string {
  return `${FIRM.siteUrl}${locale === 'es' ? '/es' : ''}/get-started/bookkeeping?start=plans`;
}
