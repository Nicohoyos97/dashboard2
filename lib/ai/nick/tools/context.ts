// What every Nick tool handler receives, plus the shaping helpers that turn
// read-model figures into small, citable tool results. The business entity is
// closed over here from the session — no tool input ever names a tenant.
import type { CitationRegistry } from '@/lib/ai/nick/citations';
import { citationLabel } from '@/lib/ai/nick/citations';
import type { PendingAction, ResolvedContext } from '@/lib/ai/nick/types';
import { formatCents, fromCents } from '@/lib/money';
import { periodKind, periodLabel } from '@/lib/reports/periods';
import type { Figure, LineNode, Metric, Ratio, ReportRow, ReportType } from '@/lib/reports/types';
import type { createAdminClient } from '@/lib/supabase/admin';
import type { createClient } from '@/lib/supabase/server';

export type Db = Awaited<ReturnType<typeof createClient>>;
export type AdminDb = ReturnType<typeof createAdminClient>;
export type NickLocale = 'en' | 'es';

export type ToolContext = {
  supabase: Db;
  /** Service role, used only to write an export file and its row (Archetype A tables). */
  admin: () => AdminDb;
  entityId: string;
  entityName: string;
  currency: string;
  locale: NickLocale;
  today: string;
  userId: string;
  sessionId: string;
  context: ResolvedContext;
  registry: CitationRegistry;
  /** The pending sensitive action the user confirmed in this message, if any. */
  confirmedAction: PendingAction | null;
  setPendingAction: (action: PendingAction) => void;
};

/** The subset the pure shaping functions need, so they are testable without a database. */
export type ShapeContext = Pick<ToolContext, 'locale' | 'currency' | 'registry'>;

export type ToolResult = Record<string, unknown>;

export class ToolError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'ToolError';
  }
}

const LABELS = {
  en: { profit_and_loss: 'Profit & Loss', balance_sheet: 'Balance Sheet', bank: 'Bank statements', page: 'Page', tax: 'Tax record', reminder: 'Reminder' },
  es: { profit_and_loss: 'Estado de resultados', balance_sheet: 'Balance general', bank: 'Estados de cuenta', page: 'Página', tax: 'Registro fiscal', reminder: 'Recordatorio' },
} as const;

export function label(locale: NickLocale, key: keyof (typeof LABELS)['en']): string {
  return LABELS[locale][key];
}

export function statementLabel(locale: NickLocale, type: ReportType): string {
  return LABELS[locale][type];
}

export function periodText(start: string, end: string, locale: NickLocale): string {
  return periodLabel(start, end, periodKind(start, end), locale);
}

export function money(ctx: ShapeContext, cents: number, currency = ctx.currency): string {
  return formatCents(cents, currency, ctx.locale === 'es' ? 'es-US' : 'en-US');
}

export const STATEMENT_PATHS: Record<ReportType, string> = {
  profit_and_loss: '/statements/profit-and-loss',
  balance_sheet: '/statements/balance-sheet',
};

export function reportHref(report: Pick<ReportRow, 'reportType' | 'periodStart' | 'periodEnd'>): string {
  return `${STATEMENT_PATHS[report.reportType]}?period=${report.periodStart}_${report.periodEnd}`;
}

export function periodOf(report: Pick<ReportRow, 'periodStart' | 'periodEnd'>, locale: NickLocale) {
  return { start: report.periodStart, end: report.periodEnd, label: periodText(report.periodStart, report.periodEnd, locale) };
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** `start_end` → range, or null for anything malformed (never throws on model input). */
export function parsePeriodInput(value: string | null | undefined): { start: string; end: string } | null {
  if (!value) return null;
  const [start, end] = value.split('_');
  if (!start || !end || !ISO.test(start) || !ISO.test(end) || start > end) return null;
  return { start, end };
}

/**
 * Which published report a tool should read: the requested period, else the
 * period selected on the page, else the newest. `requested` set but unknown
 * yields null so the model learns the period does not exist.
 */
export function pickReport(ctx: Pick<ToolContext, 'context'>, reports: readonly ReportRow[], requested: string | null): ReportRow | null {
  const wanted = parsePeriodInput(requested);
  if (requested !== null && !wanted) return null;
  const range = wanted ?? ctx.context.period;
  if (range) {
    const match = reports.find((r) => r.periodStart === range.start && r.periodEnd === range.end);
    if (match || wanted) return match ?? null;
  }
  return reports[0] ?? null;
}

export function availablePeriodsOf(reports: readonly ReportRow[], locale: NickLocale) {
  return reports.map((r) => ({ period: `${r.periodStart}_${r.periodEnd}`, label: periodText(r.periodStart, r.periodEnd, locale) }));
}

export function citeLine(ctx: ShapeContext, report: ReportRow, line: Pick<LineNode, 'id' | 'pageNumber' | 'accountName'>): string {
  return ctx.registry.add({
    label: citationLabel([
      statementLabel(ctx.locale, report.reportType),
      periodText(report.periodStart, report.periodEnd, ctx.locale),
      line.pageNumber ? `${label(ctx.locale, 'page')} ${line.pageNumber}` : null,
      line.accountName,
    ]),
    reportId: report.id,
    documentVersionId: report.documentVersionId,
    lineId: line.id,
    page: line.pageNumber,
    periodStart: report.periodStart,
    periodEnd: report.periodEnd,
    source: report.source,
    href: reportHref(report),
  });
}

/** A derived figure (working capital, a ratio, a share) cites the statement it was computed from. */
export function citeDerived(ctx: ShapeContext, report: ReportRow, what: string): string {
  return ctx.registry.add({
    label: citationLabel([statementLabel(ctx.locale, report.reportType), periodText(report.periodStart, report.periodEnd, ctx.locale), what]),
    reportId: report.id,
    documentVersionId: report.documentVersionId,
    lineId: null,
    page: null,
    periodStart: report.periodStart,
    periodEnd: report.periodEnd,
    source: report.source,
    href: reportHref(report),
  });
}

export type FigureOut = { amount: string; formatted: string; cite: string };

export function figureOut(ctx: ShapeContext, report: ReportRow, figure: Figure | null, derivedLabel?: string): FigureOut | null {
  if (!figure) return null;
  const cite = figure.lineId
    ? citeLine(ctx, report, { id: figure.lineId, pageNumber: figure.page, accountName: figure.label })
    : citeDerived(ctx, report, derivedLabel ?? figure.label);
  return { amount: fromCents(figure.cents), formatted: money(ctx, figure.cents, report.currency), cite };
}

export type ChangeOut = { amount: string; formatted: string; pct: number | null } | null;

export function changeOut(ctx: ShapeContext, report: ReportRow, deltaCents: number | null, deltaPct: number | null): ChangeOut {
  if (deltaCents === null) return null;
  return { amount: fromCents(deltaCents), formatted: money(ctx, deltaCents, report.currency), pct: deltaPct === null ? null : Math.round(deltaPct * 10) / 10 };
}

export type MetricOut = { current: FigureOut | null; prior: FigureOut | null; change: ChangeOut; reason?: string };

export function metricOut(ctx: ShapeContext, report: ReportRow, metric: Metric, derivedLabel?: string): MetricOut {
  const out: MetricOut = {
    current: figureOut(ctx, report, metric.current, derivedLabel),
    prior: figureOut(ctx, report, metric.prior, derivedLabel),
    change: changeOut(ctx, report, metric.deltaCents, metric.deltaPct),
  };
  return metric.reason ? { ...out, reason: metric.reason } : out;
}

export type RatioOut = { current: number | null; prior: number | null; cite: string; reason?: string };

export function ratioOut(ctx: ShapeContext, report: ReportRow, ratio: Ratio, what: string): RatioOut {
  const out: RatioOut = { current: ratio.current, prior: ratio.prior, cite: citeDerived(ctx, report, what) };
  return ratio.reason ? { ...out, reason: ratio.reason } : out;
}

export function reportOut(ctx: ShapeContext, report: ReportRow) {
  return {
    reportId: report.id,
    type: report.reportType,
    period: periodOf(report, ctx.locale),
    comparativePeriod: report.comparativeStart && report.comparativeEnd ? periodOf({ periodStart: report.comparativeStart, periodEnd: report.comparativeEnd }, ctx.locale) : null,
    basis: report.basis,
    currency: report.currency,
    source: report.source,
    documentVersionId: report.documentVersionId,
    publishedAt: report.publishedAt,
  };
}
