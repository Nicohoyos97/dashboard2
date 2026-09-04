// Insights across several published periods (§7). The rule engine itself is
// per-period; this walks the last few Profit & Loss periods, runs the rules
// that only need statement figures on each, and tags every result with the
// period it came from — an insight from three months ago must say so rather
// than read as if it were about now.
import type { PnlMetrics } from '@/lib/reports/pnl';
import type { LineNode } from '@/lib/reports/types';

import { generateInsights } from './rules';
import type { Insight, InsightInput } from './types';

/** How many published periods the Overview looks back over. */
export const INSIGHT_PERIODS = 4;

export type InsightPeriod = {
  start: string;
  end: string;
  label: string;
  metrics: PnlMetrics;
  lines: readonly LineNode[];
};

export type DatedInsight = Insight & {
  periodStart: string;
  periodEnd: string;
  periodLabel: string;
  /** Stable identity for a dismissal row: rule + the period it was raised for. */
  key: string;
};

export function insightKey(ruleKey: string, periodStart: string, periodEnd: string): string {
  return `${ruleKey}|${periodStart}|${periodEnd}`;
}

// A rule that is not about a period (a due date) is keyed on that date, so
// ticking it off follows the reminder rather than whichever range the client
// happened to be viewing — otherwise it would reappear on every other period.
function dismissalPeriod(insight: Insight, period: { start: string; end: string }): { start: string; end: string } {
  const due = insight.params.dueDate;
  return typeof due === 'string' ? { start: due, end: due } : period;
}

function tag(insights: readonly Insight[], period: { start: string; end: string; label: string }): DatedInsight[] {
  return insights.map((insight) => {
    const keyed = dismissalPeriod(insight, period);
    return {
      ...insight,
      periodStart: period.start,
      periodEnd: period.end,
      periodLabel: period.label,
      key: insightKey(insight.ruleKey, keyed.start, keyed.end),
    };
  });
}

export type PeriodLabel = { start: string; end: string; label: string };

/**
 * The selected period gets the full rule set (`current`, which carries cash,
 * balance and reminders); `earlier` — oldest → newest, and never including the
 * selected period — gets only the statement rules, because their cash and
 * balance figures are not loaded. Results come back newest period first, most
 * urgent within a period, capped at `limit` — after `dismissed` keys are
 * dropped, so a checked-off row never holds a slot an unseen one could use.
 */
export function insightsAcrossPeriods(
  selected: PeriodLabel,
  earlier: readonly InsightPeriod[],
  current: InsightInput,
  limit: number,
  dismissed: ReadonlySet<string> = new Set(),
): DatedInsight[] {
  const dated: DatedInsight[] = tag(generateInsights(current), selected);

  for (let index = earlier.length - 1; index >= 0; index -= 1) {
    const period = earlier[index];
    if (!period) continue;
    const prior = earlier[index - 1] ?? null;
    dated.push(
      ...tag(
        generateInsights({
          pnl: {
            current: period.metrics,
            lines: period.lines,
            ...(prior ? { prior: prior.metrics, priorLines: prior.lines } : {}),
          },
          reminders: [],
          reportsNeedingReview: 0,
          today: current.today,
        }),
        period,
      ),
    );
  }

  return dated.filter((insight) => !dismissed.has(insight.key)).slice(0, limit);
}
