import { getTranslations } from 'next-intl/server';
import { Lightbulb } from 'lucide-react';

// Deductions and credits worth raising with the firm.
//
// Deliberately not personalised and deliberately without figures. The portal
// does not know what this business bought, when it was placed in service, or
// what its owners' returns look like — and eligibility for every item below
// turns on exactly those facts. Naming an amount here, or saying a client
// "qualifies", would be tax advice the app is not entitled to give (spec §10,
// and the same rule Nick follows). So these are conversation starters, each
// with the question the owner should actually ask.
const TOPICS = [
  'section179',
  'bonusDepreciation',
  'qbi',
  'retirement',
  'homeOffice',
  'vehicle',
] as const;

export async function TaxOpportunities() {
  const t = await getTranslations('Taxes');

  return (
    <section
      aria-labelledby="tax-opportunities"
      className="border-line bg-card mt-6 rounded-2xl border p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
    >
      <h2 id="tax-opportunities" className="text-ink flex items-center gap-2 text-[16px] font-semibold">
        <Lightbulb className="text-blue size-[18px] shrink-0" aria-hidden="true" />
        {t('opportunitiesTitle')}
      </h2>
      <p className="text-muted-foreground mt-1 text-[13px] leading-[1.5]">
        {t('opportunitiesLede')}
      </p>

      <ul className="mt-4 grid gap-3 sm:grid-cols-2">
        {TOPICS.map((topic) => (
          <li key={topic} className="border-line-soft rounded-xl border p-3.5">
            <p className="text-ink text-[14px] font-semibold">{t(`topic_${topic}_title`)}</p>
            <p className="text-muted-foreground mt-1 text-[13px] leading-[1.5]">
              {t(`topic_${topic}_body`)}
            </p>
          </li>
        ))}
      </ul>

      <p className="text-muted-foreground mt-4 text-[12.5px] leading-[1.5]">
        {t('opportunitiesDisclaimer')}
      </p>
    </section>
  );
}
