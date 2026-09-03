// Calendar arithmetic on ISO `YYYY-MM-DD` strings. Everything works in UTC on
// the date parts only, so a period never shifts by a day depending on the
// server's time zone.

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export type DateParts = { year: number; month: number; day: number };

export function parseIsoDate(value: string): DateParts | null {
  const match = ISO_DATE.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

export function toIsoDate({ year, month, day }: DateParts): string {
  const pad = (n: number, width: number) => String(n).padStart(width, '0');
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function addDays(date: string, days: number): string {
  const parts = parseIsoDate(date);
  if (!parts) return date;
  const shifted = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return toIsoDate({
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  });
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number | null {
  const a = parseIsoDate(from);
  const b = parseIsoDate(to);
  if (!a || !b) return null;
  const ms = Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day);
  return Math.round(ms / 86_400_000);
}

/** `YYYY-MM` for a date. */
export function monthKey(date: string): string {
  return date.slice(0, 7);
}

/** Index of a month since year 0 so month ranges can be iterated with plain integers. */
export function monthIndex(year: number, month: number): number {
  return year * 12 + (month - 1);
}

export function monthFromIndex(index: number): { year: number; month: number } {
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

export function firstDayOfMonth(year: number, month: number): string {
  return toIsoDate({ year, month, day: 1 });
}

export function lastDayOfMonth(year: number, month: number): string {
  return toIsoDate({ year, month, day: daysInMonth(year, month) });
}

/**
 * Number of whole calendar months a range covers when it starts on the 1st
 * and ends on a month's last day; null for any other span.
 */
export function wholeMonths(start: string, end: string): number | null {
  const a = parseIsoDate(start);
  const b = parseIsoDate(end);
  if (!a || !b || a.day !== 1 || b.day !== daysInMonth(b.year, b.month)) return null;
  const span = monthIndex(b.year, b.month) - monthIndex(a.year, a.month) + 1;
  return span >= 1 ? span : null;
}

export function formatDate(date: string, locale: string, options: Intl.DateTimeFormatOptions): string {
  const parts = parseIsoDate(date);
  if (!parts) return date;
  return new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' }).format(
    Date.UTC(parts.year, parts.month - 1, parts.day),
  );
}
