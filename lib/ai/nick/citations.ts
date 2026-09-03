// Citations (spec §10 "Grounding"): every figure a tool returns is registered
// here and handed to the model as a `cite` key; the model writes `[cN]` after
// the figure; the server resolves markers back to records. No marker, no
// number — checkAnswer() is the gate the loop enforces before an answer is
// persisted or shown.
import type { CitationRecord } from './types';

export type CitationInput = Omit<CitationRecord, 'key'>;

export class CitationRegistry {
  private readonly records = new Map<string, CitationRecord>();
  private readonly byIdentity = new Map<string, string>();

  /** Registers a citable figure and returns its key; identical inputs share one key. */
  add(input: CitationInput): string {
    const identity = JSON.stringify([
      input.reportId,
      input.documentVersionId,
      input.lineId,
      input.page,
      input.periodStart,
      input.periodEnd,
      input.source,
      input.label,
    ]);
    const existing = this.byIdentity.get(identity);
    if (existing) return existing;
    const key = `c${this.records.size + 1}`;
    this.records.set(key, { key, ...input });
    this.byIdentity.set(identity, key);
    return key;
  }

  get(key: string): CitationRecord | undefined {
    return this.records.get(key);
  }

  get size(): number {
    return this.records.size;
  }

  all(): CitationRecord[] {
    return [...this.records.values()];
  }
}

const MARKER = /\[(c\d+)\]/g;

/** Citation keys in order of first appearance. */
export function markersIn(text: string): string[] {
  const seen = new Set<string>();
  for (const match of text.matchAll(MARKER)) {
    const key = match[1];
    if (key) seen.add(key);
  }
  return [...seen];
}

export function stripMarkers(text: string): string {
  return text.replace(/\s?\[c\d+\]/g, '');
}

// A "financial figure": a currency amount, a decimal, a percentage, a
// comma-grouped number, or five or more digits. Years, page numbers and small
// counts pass on their own — those are not figures the reader could mistake
// for a statement value.
const FIGURE = /[$€£]\s?\d|\d[\d,]*\.\d{1,2}(?!\d)|\d+(?:\.\d+)?\s?%|\b\d{1,3}(?:,\d{3})+\b|\b\d{5,}\b/;
// Download links and identifiers carry digits that are not statement values.
const NOT_FIGURES = /https?:\/\/\S+|\/\S*\/\S*|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

export function hasFinancialFigure(text: string): boolean {
  return FIGURE.test(text.replace(NOT_FIGURES, ' '));
}

export type AnswerCheck =
  | { ok: true; citations: CitationRecord[] }
  | { ok: false; reason: 'unknown_marker' | 'uncited_figure'; unknown: string[] };

/** The server-side gate: markers must resolve, and a figure needs at least one marker. */
export function checkAnswer(text: string, registry: CitationRegistry): AnswerCheck {
  const keys = markersIn(text);
  const unknown = keys.filter((key) => !registry.get(key));
  if (unknown.length > 0) return { ok: false, reason: 'unknown_marker', unknown };
  if (keys.length === 0 && hasFinancialFigure(stripMarkers(text))) {
    return { ok: false, reason: 'uncited_figure', unknown: [] };
  }
  const citations = keys.flatMap((key) => {
    const record = registry.get(key);
    return record ? [record] : [];
  });
  return { ok: true, citations };
}

/** Chip text: `Profit & Loss · Jan–Jun 2026 · Page 3 · Payroll Expense`. */
export function citationLabel(parts: readonly (string | number | null | undefined)[]): string {
  return parts
    .flatMap((part) => (part === null || part === undefined || part === '' ? [] : [String(part)]))
    .join(' · ');
}
