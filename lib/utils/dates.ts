// Date-only values (Postgres `date`, ISO YYYY-MM-DD) carry no time zone.
// `new Date('2026-01-01')` is UTC midnight, which Intl renders as Dec 31 in
// the Americas — so date-only strings are always formatted in UTC here.
export function formatIsoDate(
  value: string | null | undefined,
  locale: string,
  options: Intl.DateTimeFormatOptions = { dateStyle: 'medium' },
): string {
  if (!value) return '';
  return new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' }).format(new Date(value));
}

export function formatPeriod(
  start: string | null | undefined,
  end: string | null | undefined,
  locale: string,
): string {
  if (!start || !end) return '';
  return `${formatIsoDate(start, locale)} – ${formatIsoDate(end, locale)}`;
}

/**
 * A period in as few characters as a chart axis can print.
 *
 * A whole calendar month becomes "Aug 2026". The full form —
 * "Aug 1, 2026 – Aug 31, 2026" — is wide enough that Recharts drops all but
 * the first and last tick, which leaves a line nobody can read a date off.
 * Anything that is not a whole month keeps the long form, where the exact days
 * are the information.
 */
export function formatPeriodCompact(
  start: string | null | undefined,
  end: string | null | undefined,
  locale: string,
): string {
  if (!start || !end) return '';
  if (!isWholeMonth(start, end)) return formatPeriod(start, end, locale);
  return formatIsoDate(start, locale, { month: 'short', year: 'numeric' });
}

function isWholeMonth(start: string, end: string): boolean {
  if (start.slice(0, 7) !== end.slice(0, 7) || start.slice(8, 10) !== '01') return false;
  const [year, month] = start.split('-').map(Number);
  if (!year || !month) return false;
  // Day 0 of the next month is the last day of this one.
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return Number(end.slice(8, 10)) === lastDay;
}
