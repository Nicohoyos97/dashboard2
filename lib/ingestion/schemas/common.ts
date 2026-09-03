// Shared Zod primitives. Two flavours per field: the *Api* form is what the
// model is asked to produce (plain types + descriptions — the API does not
// support min/max/length/pattern keywords) and the strict form re-validates
// before anything is trusted. Amounts are decimal strings, never floats.
import { z } from 'zod';

export const DECIMAL_PATTERN = /^-?\d{1,15}(\.\d{1,2})?$/;
export const UNSIGNED_DECIMAL_PATTERN = /^\d{1,15}(\.\d{1,2})?$/;

const DECIMAL_DESCRIPTION =
  'Amount as a decimal string with up to two decimals and a leading minus for negatives, ' +
  'e.g. "1234.56" or "-870.00". No currency symbols, no thousands separators; ' +
  'parentheses or a trailing minus on the page mean negative.';

// Descriptions are attached before any .optional() / .nullable() wrapper:
// describing the wrapper makes zod hoist the schema into $defs / $ref.
const withDetail = (detail: string | undefined, base: string): string => (detail ? `${detail}. ${base}` : base);

export const decimalApi = (detail?: string) => z.string().describe(withDetail(detail, DECIMAL_DESCRIPTION));
export const decimal = () => z.string().regex(DECIMAL_PATTERN);
export const unsignedDecimal = () => z.string().regex(UNSIGNED_DECIMAL_PATTERN);

export const pageApi = (detail?: string) =>
  z.int().describe(withDetail(detail, '1-based page number exactly as labelled "Page N" in this request'));
export const page = () => z.int().positive();

export const confidenceApi = () =>
  z.number().describe('Your confidence that the transcription is exact, from 0 to 1');
export const confidence = () => z.number().min(0).max(1);

// `format: date` is one of the string formats the API enforces natively.
export const isoDateApi = (detail?: string) => z.iso.date().describe(withDetail(detail, 'Calendar date as YYYY-MM-DD'));
export const isoDate = () => z.iso.date();

export const nonEmpty = () => z.string().trim().min(1);

/** True when both dates are absent or start ≤ end. */
export function periodOrdered(start: string | undefined, end: string | undefined): boolean {
  return start === undefined || end === undefined || start <= end;
}

/** True when both are present or both absent (comparative columns come in pairs). */
export function bothOrNeither(a: unknown, b: unknown): boolean {
  return (a === undefined) === (b === undefined);
}
