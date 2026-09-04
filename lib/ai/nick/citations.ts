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
// comma-grouped number, or three or more bare digits. Each alternative matches
// the WHOLE amount, so "$80,000.00" is one figure rather than "$8" followed by
// a stray decimal — the span matters, because the gate below asks whether a
// marker follows each figure.
//
// Three bare digits, not five: "you kept 2600" is money to the reader, and
// plain language like that is exactly what the system prompt asks the model to
// write. Page numbers and counts below 100 still pass.
const FIGURE =
  /[$€£]\s?\d[\d,]*(?:\.\d+)?%?|\b\d[\d,]*\.\d{1,2}(?!\d)|\b\d+(?:\.\d+)?\s?%|\b\d{1,3}(?:,\d{3})+\b|\b\d{3,}\b/g;

// Digits that are not statement values: download links and identifiers, ISO
// dates, and four-digit calendar years. Masking a year leaves a real amount
// written bare as "2000" undetected; that is the deliberate trade, because the
// alternative is demanding a citation from every sentence that names a year.
const NOT_FIGURES =
  /https?:\/\/\S+|\/\S*\/\S*|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\b\d{4}-\d{2}-\d{2}\b|\b(?:19|20)\d{2}\b/gi;

/** Blanks a region while preserving length, so match offsets stay comparable. */
function mask(text: string, pattern: RegExp): string {
  return text.replace(pattern, (match) => ' '.repeat(match.length));
}

/** The text as the figure scanner sees it: identifiers, dates and markers blanked. */
function maskedForFigures(text: string): string {
  return mask(mask(text, NOT_FIGURES), MARKER);
}

export function hasFinancialFigure(text: string): boolean {
  return new RegExp(FIGURE.source).test(maskedForFigures(text));
}

/**
 * Figures that no marker follows. The system prompt tells the model to write
 * the marker immediately after the figure it came from, so a figure is cited
 * when a marker appears between its end and the start of the next figure.
 *
 * Checking this per figure rather than per message is the point: a single [c1]
 * anywhere used to satisfy the whole answer, which let a real, sourced number
 * carry fabricated ones along beside it.
 */
export function uncitedFigures(text: string): string[] {
  const figures = [...maskedForFigures(text).matchAll(new RegExp(FIGURE.source, 'g'))];
  if (figures.length === 0) return [];
  const markerAt = [...text.matchAll(new RegExp(MARKER.source, 'g'))].map((m) => m.index ?? 0);

  return figures.flatMap((figure, i) => {
    const from = (figure.index ?? 0) + figure[0].length;
    const next = figures[i + 1]?.index ?? text.length;
    const cited = markerAt.some((at) => at >= from && at < next);
    return cited ? [] : [figure[0].trim()];
  });
}

export type AnswerCheck =
  | { ok: true; citations: CitationRecord[] }
  | { ok: false; reason: 'unknown_marker' | 'uncited_figure'; unknown: string[] };

/** The server-side gate: markers must resolve, and a figure needs at least one marker. */
export function checkAnswer(text: string, registry: CitationRegistry): AnswerCheck {
  const keys = markersIn(text);
  const unknown = keys.filter((key) => !registry.get(key));
  if (unknown.length > 0) return { ok: false, reason: 'unknown_marker', unknown };
  if (uncitedFigures(text).length > 0) {
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
