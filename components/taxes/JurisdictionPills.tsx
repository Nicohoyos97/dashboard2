import { getTranslations } from 'next-intl/server';

import type { SalesTaxJurisdiction } from '@/lib/portal/taxes';

// Where this business collects sales tax, named — "Illinois", "City of Niles".
// It replaces a card that printed how many jurisdictions there were, which is
// the one thing about them a client already knows and cannot check.
export async function JurisdictionPills({
  jurisdictions,
}: {
  jurisdictions: readonly SalesTaxJurisdiction[];
}) {
  const t = await getTranslations('Taxes');
  if (jurisdictions.length === 0) return null;

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      <span id="registered-in" className="text-muted-foreground text-[12.5px]">
        {t('registeredIn')}
      </span>
      <ul aria-labelledby="registered-in" className="flex flex-wrap gap-2">
        {jurisdictions.map((jurisdiction) => (
          <li
            key={`${jurisdiction.level}:${jurisdiction.name}`}
            className="bg-blue-pale text-blue rounded-full px-2.5 py-1 text-[12.5px] font-semibold"
          >
            {jurisdiction.name}
          </li>
        ))}
      </ul>
    </div>
  );
}
