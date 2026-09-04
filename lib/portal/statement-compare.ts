import 'server-only';

import { amountsByPath, hasAnyPrior, withComparison } from '@/lib/reports/compare';
import { comparableSeries } from '@/lib/reports/series';
import { buildTree } from '@/lib/reports/tree';
import type { LineNode, ReportRow } from '@/lib/reports/types';
import { formatPeriod } from '@/lib/utils/dates';

import { loadReportLines } from './load';
import { periodParam } from './period-param';

type Db = Parameters<typeof loadReportLines>[0];

export type CompareResolution = {
  /** The tree to render — untouched when comparing against the printed column. */
  roots: LineNode[];
  hasPrior: boolean;
  options: { value: string; label: string }[];
  current: string;
  /** The sentence for the page header, or null when the printed column stands. */
  note: string | null;
};

/**
 * Resolves the `?compare=` choice for a statement page.
 *
 * The default — an empty value — leaves the document's own printed comparative
 * alone, because that column is part of the statement the firm published.
 * Choosing a period instead puts two published statements side by side, which
 * is this app's arithmetic rather than the document's, so it returns a note for
 * the header saying so.
 *
 * Only comparable periods are offered: same statement, same currency, same
 * length, and never the one already on screen. Comparing a month against a year
 * would produce numbers that mean nothing.
 */
export async function resolveComparison({
  supabase,
  entityId,
  report,
  reports,
  roots,
  requested,
  locale,
  labels,
}: {
  supabase: Db;
  entityId: string;
  report: ReportRow;
  reports: ReportRow[];
  roots: LineNode[];
  requested: string | undefined;
  locale: string;
  labels: { printed: string; comparedWith: (period: string) => string };
}): Promise<CompareResolution> {
  const candidates = comparableSeries(reports, report).filter(
    (candidate) => candidate.id !== report.id,
  );

  const options = [
    { value: '', label: labels.printed },
    ...candidates.map((candidate) => ({
      value: periodParam({ start: candidate.periodStart, end: candidate.periodEnd }),
      label: formatPeriod(candidate.periodStart, candidate.periodEnd, locale),
    })),
  ];

  const chosen = candidates.find(
    (candidate) =>
      periodParam({ start: candidate.periodStart, end: candidate.periodEnd }) === requested,
  );
  if (!chosen) {
    // Includes a `compare` value naming a period that is not comparable or not
    // published: fall back to the printed column rather than to nothing.
    return { roots, hasPrior: hasAnyPrior(roots), options, current: '', note: null };
  }

  const comparison = amountsByPath(buildTree(await loadReportLines(supabase, entityId, chosen.id)));
  const compared = withComparison(roots, comparison);
  return {
    roots: compared,
    hasPrior: hasAnyPrior(compared),
    options,
    current: periodParam({ start: chosen.periodStart, end: chosen.periodEnd }),
    note: labels.comparedWith(formatPeriod(chosen.periodStart, chosen.periodEnd, locale)),
  };
}
