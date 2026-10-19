// The period a QuickBooks report prints on its third title line, read into ISO
// dates. Only the shapes QuickBooks Online writes are accepted; anything else
// is null, and the ledger then takes the period the firm set on the document
// rather than one guessed from its transaction dates.
//
//   "September 2026"                      → the whole month
//   "September 1-30, 2026"                → one month, both days printed
//   "January 1-October 18, 2026"          → a range inside one year
//   "January 1, 2026 - March 31, 2026"    → a range across years
//   "January - September, 2026"           → whole months

export type LedgerPeriod = { start: string; end: string };

const MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];

function month(name: string): number | null {
  const key = name.trim().toLowerCase().replace(/\.$/, '');
  const index = MONTHS.findIndex((m) => m === key || (key.length >= 3 && m.startsWith(key)));
  return index === -1 ? null : index + 1;
}

function lastDay(year: number, m: number): number {
  return new Date(Date.UTC(year, m, 0)).getUTCDate();
}

function iso(year: number, m: number, day: number): string | null {
  if (m < 1 || m > 12 || day < 1 || day > lastDay(year, m)) return null;
  return `${year}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function range(start: string | null, end: string | null): LedgerPeriod | null {
  return start && end && start <= end ? { start, end } : null;
}

const WORD = '([A-Za-z]{3,9}\\.?)';
const WHOLE_MONTH = new RegExp(`^${WORD}\\s+(\\d{4})$`);
const SAME_MONTH = new RegExp(`^${WORD}\\s+(\\d{1,2})\\s*-\\s*(\\d{1,2}),\\s*(\\d{4})$`);
const ONE_YEAR = new RegExp(`^${WORD}\\s+(\\d{1,2})\\s*-\\s*${WORD}\\s+(\\d{1,2}),\\s*(\\d{4})$`);
const TWO_YEARS = new RegExp(`^${WORD}\\s+(\\d{1,2}),\\s*(\\d{4})\\s*-\\s*${WORD}\\s+(\\d{1,2}),\\s*(\\d{4})$`);
const MONTH_SPAN = new RegExp(`^${WORD}\\s*-\\s*${WORD},?\\s+(\\d{4})$`);

export function parseLedgerPeriod(label: string | null | undefined): LedgerPeriod | null {
  const text = (label ?? '').trim().replace(/[–—]/g, '-').replace(/\s+/g, ' ');
  if (!text) return null;

  let m = WHOLE_MONTH.exec(text);
  if (m) {
    const mo = month(m[1] ?? '');
    const year = Number(m[2]);
    return mo === null ? null : range(iso(year, mo, 1), iso(year, mo, lastDay(year, mo)));
  }
  m = SAME_MONTH.exec(text);
  if (m) {
    const mo = month(m[1] ?? '');
    const year = Number(m[4]);
    return mo === null ? null : range(iso(year, mo, Number(m[2])), iso(year, mo, Number(m[3])));
  }
  m = ONE_YEAR.exec(text);
  if (m) {
    const from = month(m[1] ?? '');
    const to = month(m[3] ?? '');
    const year = Number(m[5]);
    return from === null || to === null ? null : range(iso(year, from, Number(m[2])), iso(year, to, Number(m[4])));
  }
  m = TWO_YEARS.exec(text);
  if (m) {
    const from = month(m[1] ?? '');
    const to = month(m[4] ?? '');
    return from === null || to === null
      ? null
      : range(iso(Number(m[3]), from, Number(m[2])), iso(Number(m[6]), to, Number(m[5])));
  }
  m = MONTH_SPAN.exec(text);
  if (m) {
    const from = month(m[1] ?? '');
    const to = month(m[2] ?? '');
    const year = Number(m[3]);
    return from === null || to === null ? null : range(iso(year, from, 1), iso(year, to, lastDay(year, to)));
  }
  return null;
}
