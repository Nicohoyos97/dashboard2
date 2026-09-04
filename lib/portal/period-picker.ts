import 'server-only';

import { formatPeriod } from '@/lib/utils/dates';
import type { Period } from '@/lib/reports/periods';
import { type RelativePreset, presetChoices } from '@/lib/reports/presets';

import { periodParam } from './period-param';

// Builds the picker's rows once, on the server, so every page means the same
// thing by "this quarter" — resolved in the business's own calendar — and no
// date arithmetic runs in the browser.
export type PickerProps = {
  presets: { value: string; label: string; published: boolean }[];
  published: { value: string; label: string; published: boolean }[];
  current: string;
  currentLabel: string;
  customFrom: string;
  customTo: string;
};

export function periodPickerProps({
  periods,
  selected,
  today,
  locale,
  presetLabel,
}: {
  /** The ranges the firm has actually published, in the page's own order. */
  periods: readonly Period[];
  selected: Period;
  /** todayIn(business timezone) — a Florida client's "this month" is theirs. */
  today: string;
  locale: string;
  presetLabel: (preset: RelativePreset) => string;
}): PickerProps {
  const ranges = periods.map((period) => ({ start: period.start, end: period.end }));

  return {
    presets: presetChoices(today, ranges, () => '').map((choice) => ({
      value: choice.value,
      // The preset's own name, not the dates it resolved to: "This quarter"
      // is what the owner asked for, and the header already states the range.
      label: presetLabel(choice.preset),
      published: choice.published,
    })),
    published: periods.map((period) => ({
      value: periodParam(period),
      label: period.label,
      published: true,
    })),
    current: periodParam(selected),
    currentLabel: formatPeriod(selected.start, selected.end, locale),
    customFrom: selected.start,
    customTo: selected.end,
  };
}
