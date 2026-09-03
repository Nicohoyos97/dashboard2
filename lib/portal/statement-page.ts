// Shared server-side selection for the two statement pages: which published
// report of a type the URL period points at (default: the newest), and the
// period options offered to the selector (only periods with a report).
import 'server-only';

import type { PeriodOption } from '@/components/dashboard/PeriodSelector';
import type { ReportRow } from '@/lib/reports/types';
import { formatIsoDate, formatPeriod } from '@/lib/utils/dates';

import { type Period, parsePeriodParam, periodParam } from './period-param';

export function selectReport(reports: ReportRow[], periodValue: string | undefined): ReportRow | null {
  const wanted: Period | null = parsePeriodParam(periodValue);
  if (wanted) {
    const match = reports.find((r) => r.periodStart === wanted.start && r.periodEnd === wanted.end);
    if (match) return match;
  }
  return reports[0] ?? null;
}

export function reportPeriodOptions(reports: ReportRow[], locale: string): PeriodOption[] {
  const seen = new Set<string>();
  const options: PeriodOption[] = [];
  for (const r of reports) {
    const value = periodParam({ start: r.periodStart, end: r.periodEnd });
    if (seen.has(value)) continue;
    seen.add(value);
    // A balance sheet is a single date; a P&L spans a period.
    options.push({ value, label: r.periodStart === r.periodEnd ? formatIsoDate(r.periodEnd, locale) : formatPeriod(r.periodStart, r.periodEnd, locale) });
  }
  return options;
}

export function leafItems(node: { children: { accountName: string; currentCents: number | null; isTotal: boolean; isSection: boolean; children: unknown[] }[] } | null): { label: string; cents: number }[] {
  if (!node) return [];
  const items: { label: string; cents: number }[] = [];
  const visit = (n: { accountName: string; currentCents: number | null; isTotal: boolean; isSection: boolean; children: unknown[] }) => {
    if (n.isTotal) return;
    if (n.children.length > 0) {
      for (const c of n.children as typeof node.children) visit(c);
      return;
    }
    if (!n.isSection && n.currentCents !== null && n.currentCents > 0) items.push({ label: n.accountName, cents: n.currentCents });
  };
  for (const c of node.children) visit(c);
  return items;
}
