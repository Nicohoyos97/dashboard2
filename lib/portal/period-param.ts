// The reporting period travels in the URL (`?period=YYYY-MM-DD_YYYY-MM-DD`)
// so every page, chart and download link agrees on it. Only periods that
// actually have data are ever offered (spec §7); an unknown value falls back
// to the newest one.
export type Period = { start: string; end: string };

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export function parsePeriodParam(value: string | undefined): Period | null {
  if (!value) return null;
  const [start, end] = value.split('_');
  if (!start || !end || !ISO.test(start) || !ISO.test(end) || start > end) return null;
  return { start, end };
}

export function periodParam(period: Period): string {
  return `${period.start}_${period.end}`;
}

export function samePeriod(a: Period | null, b: Period | null): boolean {
  return !!a && !!b && a.start === b.start && a.end === b.end;
}

export function withPeriod(path: string, period: Period | null): string {
  return period ? `${path}?period=${periodParam(period)}` : path;
}
