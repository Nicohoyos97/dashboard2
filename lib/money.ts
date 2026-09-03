// Integer-cents money helpers. Every figure the app reports is computed here
// (or in SQL) from transcribed decimal strings — the model never does
// arithmetic (INITIAL_PROMPT.md §3). Cents stay within Number.MAX_SAFE_INTEGER
// (≈ $90 trillion), which is checked rather than assumed.

export class MoneyParseError extends Error {
  readonly code = 'money_parse' as const;

  constructor() {
    super('Value is not a decimal amount');
    this.name = 'MoneyParseError';
  }
}

// A comma is only a thousands separator when exactly three digits follow it;
// anything else ("1.234,56") is a locale we do not parse and must not guess at.
const BAD_THOUSANDS = /,(?!\d{3}(?:\D|$))/;
const MAGNITUDE = /^(\d+)(?:\.(\d*))?$/;
const CURRENCY_PREFIX = /^[$€£]\s?/;

function assertSafeCents(cents: number): number {
  if (!Number.isSafeInteger(cents)) throw new MoneyParseError();
  return cents;
}

/** "1,234.56" · "(1,234.56)" · "-12.5" · "$12.50-" · 1234.5 → integer cents. Throws MoneyParseError on anything else. */
export function toCents(value: string | number): number {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new MoneyParseError();
    return toCents(value.toFixed(6));
  }
  let text = value.trim();
  let negative = false;
  if (text.startsWith('(') && text.endsWith(')')) {
    negative = true;
    text = text.slice(1, -1).trim();
  }
  text = text.replace(CURRENCY_PREFIX, '');
  if (text.startsWith('-') || text.startsWith('+')) {
    negative = negative !== text.startsWith('-');
    text = text.slice(1).trim();
  } else if (text.endsWith('-')) {
    negative = !negative;
    text = text.slice(0, -1).trim();
  }
  if (text === '' || BAD_THOUSANDS.test(text)) throw new MoneyParseError();
  const match = MAGNITUDE.exec(text.replace(/,/g, ''));
  if (!match || match[1] === undefined) throw new MoneyParseError();

  const fraction = (match[2] ?? '').padEnd(3, '0');
  const roundUp = fraction.charCodeAt(2) >= '5'.charCodeAt(0) ? 1 : 0;
  const cents = Number(match[1]) * 100 + Number(fraction.slice(0, 2)) + roundUp;
  const signed = negative ? -cents : cents;
  return assertSafeCents(signed === 0 ? 0 : signed);
}

/** Integer cents → canonical decimal string ("-1234.56"). */
export function fromCents(cents: number): string {
  assertSafeCents(cents);
  const magnitude = Math.abs(cents);
  const whole = Math.floor(magnitude / 100);
  const fraction = String(magnitude % 100).padStart(2, '0');
  return `${cents < 0 ? '-' : ''}${whole}.${fraction}`;
}

export function sumCents(values: Iterable<number>): number {
  let total = 0;
  for (const value of values) total = assertSafeCents(total + assertSafeCents(value));
  return total;
}

export function formatCents(cents: number, currency = 'USD', locale = 'en-US'): string {
  assertSafeCents(cents);
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(cents / 100);
}

/**
 * Change from `prior` to `current`. `pct` is relative to the magnitude of the
 * prior figure so a loss shrinking from -100 to -50 reads as +50%; it is null
 * when there is no prior figure to compare against.
 */
export function variance(
  currentCents: number,
  priorCents: number,
): { deltaCents: number; pct: number | null } {
  const deltaCents = assertSafeCents(currentCents) - assertSafeCents(priorCents);
  return {
    deltaCents,
    pct: priorCents === 0 ? null : (deltaCents / Math.abs(priorCents)) * 100,
  };
}
