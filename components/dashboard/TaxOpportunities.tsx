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
      className="border-line bg-card mt-6 rounded-2xl border p-5 shadow-card"
    >
      <h2 id="tax-opportunities" className="text-ink flex items-center gap-2 text-title font-semibold">
        <Lightbulb className="text-link size-[18px] shrink-0" aria-hidden="true" />
        {t('opportunitiesTitle')}
      </h2>
      <p className="text-muted-foreground mt-1 text-small leading-[1.5]">
        {t('opportunitiesLede')}
      </p>

      {/* A reading list, not six tiles: each topic is a question to take to
          the accountant, and a box around each made them look like buttons. */}
      <ul className="mt-2 grid grid-cols-1 gap-x-10 sm:grid-cols-2">
        {TOPICS.map((topic) => (
          <li key={topic} className="border-line-soft border-b py-4 sm:[&:nth-last-child(-n+2)]:border-b-0 max-sm:last:border-b-0">
            <p className="text-ink text-ui font-semibold">{t(`topic_${topic}_title`)}</p>
            <p className="text-muted-foreground mt-1 text-small leading-[1.55] text-pretty">
              {t(`topic_${topic}_body`)}
            </p>
          </li>
        ))}
      </ul>

      <p className="text-muted-foreground border-line mt-2 border-t pt-4 text-caption leading-[1.5]">
        {t('opportunitiesDisclaimer')}
      </p>
    </section>
  );
}
