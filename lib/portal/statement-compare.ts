import 'server-only';

import { amountsByPath, hasAnyPrior, withComparison } from '@/lib/reports/compare';
import { comparableTo } from '@/lib/reports/series';
import { type RelativePreset, presetChoices, presetOf } from '@/lib/reports/presets';
import { buildTree } from '@/lib/reports/tree';
import type { LineNode, ReportRow } from '@/lib/reports/types';
import { formatPeriod } from '@/lib/utils/dates';

import { loadReportLines } from './load';
import { periodParam } from './period-param';

type Db = Parameters<typeof loadReportLines>[0];

export type CompareChoice = { value: string; label: string; published: boolean };

export type CompareResolution = {
  /** The tree to render — untouched when comparing against the printed column. */
  roots: LineNode[];
  hasPrior: boolean;
  /** "As printed on the statement" — the default, always selectable. */
  leading: CompareChoice[];
  /** This month, Last quarter, Last year… against comparable published periods. */
  presets: CompareChoice[];
  /** The comparable published ranges, named by their dates. */
  published: CompareChoice[];
  current: string;
  currentLabel: string;
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
  today,
  labels,
}: {
  supabase: Db;
  entityId: string;
  report: ReportRow;
  reports: ReportRow[];
  roots: LineNode[];
  requested: string | undefined;
  locale: string;
  /** todayIn(business timezone), so "last quarter" is the client's quarter. */
  today: string;
  labels: {
    printed: string;
    comparedWith: (period: string) => string;
    preset: (preset: RelativePreset) => string;
  };
}): Promise<CompareResolution> {
  // Either direction: the presets are relative to today, so a client looking at
  // July may pick "last month" and mean August.
  const candidates = comparableTo(reports, report).filter(
    (candidate) => candidate.id !== report.id,
  );

  const ranges = candidates.map((candidate) => ({
    start: candidate.periodStart,
    end: candidate.periodEnd,
  }));

  const leading: CompareChoice[] = [{ value: '', label: labels.printed, published: true }];
  // The same vocabulary the period picker uses. `published` here means "there
  // is a comparable published statement for exactly this range" — a preset
  // without one cannot be compared against, so the picker disables it rather
  // than accepting the choice and quietly falling back.
  // The period on screen is dropped rather than listed as unavailable: you
  // cannot compare a statement with itself, and "no published report covers
  // this period" would be the wrong reason — it is published, it is just the
  // one you are looking at.
  const onScreen = periodParam({ start: report.periodStart, end: report.periodEnd });
  const presets: CompareChoice[] = presetChoices(today, ranges, () => '')
    .filter((choice) => choice.value !== onScreen)
    .map((choice) => ({
      value: choice.value,
      label: labels.preset(choice.preset),
      published: choice.published,
    }));
  const published: CompareChoice[] = candidates.map((candidate) => ({
    value: periodParam({ start: candidate.periodStart, end: candidate.periodEnd }),
    label: formatPeriod(candidate.periodStart, candidate.periodEnd, locale),
    published: true,
  }));

  const chosen = candidates.find(
    (candidate) =>
      periodParam({ start: candidate.periodStart, end: candidate.periodEnd }) === requested,
  );
  if (!chosen) {
    // Includes a `compare` value naming a period that is not comparable or not
    // published: fall back to the printed column rather than to nothing.
    return {
      roots,
      hasPrior: hasAnyPrior(roots),
      leading,
      presets,
      published,
      current: '',
      currentLabel: labels.printed,
      note: null,
    };
  }

  const comparison = amountsByPath(buildTree(await loadReportLines(supabase, entityId, chosen.id)));
  const compared = withComparison(roots, comparison);
  const chosenValue = periodParam({ start: chosen.periodStart, end: chosen.periodEnd });
  const chosenRange = { start: chosen.periodStart, end: chosen.periodEnd };
  const asPreset = presetOf(chosenRange, today);
  return {
    roots: compared,
    hasPrior: hasAnyPrior(compared),
    leading,
    presets,
    published,
    current: chosenValue,
    // Named as the preset when it is one — "Last quarter" reads better than a
    // date range the client just picked by that name.
    currentLabel: asPreset
      ? labels.preset(asPreset)
      : formatPeriod(chosen.periodStart, chosen.periodEnd, locale),
    note: labels.comparedWith(formatPeriod(chosen.periodStart, chosen.periodEnd, locale)),
  };
}
