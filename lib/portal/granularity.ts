// Which reporting granularities the published sources actually support
// (INITIAL_PROMPT.md §3, §14.13). A granularity nothing covers is offered as a
// disabled control carrying the reason — never synthesized by slicing a longer
// report into months it does not print.
import { granularity, periodKind, type GranularityReason, type Period } from '@/lib/reports/periods';

import { periodParam, type Period as PeriodRange } from './period-param';

export type GranularityKind = 'month' | 'quarter' | 'year';

export const GRANULARITY_KINDS: readonly GranularityKind[] = ['month', 'quarter', 'year'];

export type GranularityChoice = {
  kind: GranularityKind;
  enabled: boolean;
  reason: GranularityReason | null;
  /** Newest published period of this kind — where choosing the tab navigates. */
  value: string | null;
  selected: boolean;
};

/**
 * `periods` arrives newest first (`availablePeriods`), so the first period of a
 * kind is the one a tab should land on. `hasMonthlyBank` is false here because
 * bank statements already enter `availablePeriods` as month-kind periods; the
 * portal never buckets daily rows into a unit the sources do not publish.
 */
export function granularityChoices(
  periods: readonly Period[],
  selected: PeriodRange | null,
): GranularityChoice[] {
  const state = granularity(periods, false);
  const selectedKind = selected ? periodKind(selected.start, selected.end) : null;
  return GRANULARITY_KINDS.map((kind) => {
    const newest = periods.find((period) => period.kind === kind) ?? null;
    return {
      kind,
      enabled: state[kind].enabled,
      reason: state[kind].reason ?? null,
      value: newest ? periodParam(newest) : null,
      selected: selectedKind === kind,
    };
  });
}
