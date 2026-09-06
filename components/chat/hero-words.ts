// The four things a client opens Nick to ask about, in the order they cycle
// through the hero question. Message keys rather than words, the way
// SUGGESTIONS holds keys: each carries its own question mark, because the
// sentence ends on whichever one is showing.
export const HERO_WORDS = [
  'heroWordSales',
  'heroWordTaxes',
  'heroWordExpenses',
  'heroWordObligations',
] as const;
