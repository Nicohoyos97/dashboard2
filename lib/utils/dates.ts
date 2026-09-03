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
