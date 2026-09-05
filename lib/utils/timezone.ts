// The calendar a business keeps (migration 0010). Every date rule in the portal
// — reminder status, tax alerts, next due date, Nick's context — compares
// calendar days, so it must resolve "today" in the business's own zone. Reading
// it from the server's clock made a Florida client "one day late" from 8 pm.

export const DEFAULT_TIMEZONE = 'UTC';

/**
 * IANA names this runtime knows, for validating what the firm picks — with
 * DEFAULT_TIMEZONE guaranteed present.
 *
 * Chrome's Intl.supportedValuesOf('timeZone') returns 418 canonical zones and
 * *not* 'UTC'. A <select> whose value is missing from its options falls back to
 * showing the first one, so the new-business form displayed "Africa/Abidjan"
 * while its state still held 'UTC' — the admin read one calendar and the
 * database got another, and every due date in that client's portal resolved in
 * the zone nobody chose.
 */
export function supportedTimeZones(): string[] {
  // Node 18+/modern browsers expose the full IANA list; fall back to the few
  // zones the firm's clients are actually in rather than to nothing.
  const supported = (Intl as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf;
  const zones = supported
    ? supported('timeZone')
    : ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'America/Bogota'];
  return zones.includes(DEFAULT_TIMEZONE) ? zones : [DEFAULT_TIMEZONE, ...zones];
}

export function isValidTimeZone(value: string): boolean {
  if (value.trim() === '') return false;
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/**
 * The calendar date in `timeZone`, as `YYYY-MM-DD`. `en-CA` formats exactly
 * that way, so no part-reassembly is needed. An unknown zone falls back to UTC
 * rather than throwing: a portal page must still render if the firm somehow
 * stored a name this runtime does not know.
 */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}
