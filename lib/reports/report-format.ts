// Formatting for the client-facing report documents (KILL-PDF.md).
//
// Detail rows print bare grouped decimals; totals and bands carry the currency
// symbol; negatives are parenthesised with the symbol outside — "$(10,542.31)".
// Grouping is forced because Spanish leaves four-digit numbers ungrouped by
// default, which puts "5000,00" beside "12.000,00" in the same column.
//
// The separators themselves follow MONEY_LOCALE rather than the language the
// letter is written in: this is a US accounting document, and a client
// comparing it to their bank statement should not have to re-read the commas.
import { MONEY_LOCALE } from '@/lib/money';

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/**
 * Account names, vendor names and every other string taken from an uploaded
 * document are untrusted (CLAUDE.md §2.8) and land inside a Chromium page.
 * Nothing reaches the template without passing through here.
 */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char);
}

function grouped(value: number): string {
  return new Intl.NumberFormat(MONEY_LOCALE, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: true,
  }).format(value);
}

export function currencySymbol(currency: string): string {
  try {
    const parts = new Intl.NumberFormat(MONEY_LOCALE, {
      style: 'currency',
      currency,
      currencyDisplay: 'narrowSymbol',
    }).formatToParts(0);
    return parts.find((part) => part.type === 'currency')?.value ?? currency;
  } catch {
    // An unknown currency code makes Intl throw; the code itself still reads.
    return currency;
  }
}

/** A detail-row figure: no symbol, negatives in parentheses. */
export function reportNumber(cents: number | null): string {
  if (cents === null) return '';
  const text = grouped(Math.abs(cents) / 100);
  return cents < 0 ? `(${text})` : text;
}

/** A total or band figure: symbol outside the parentheses, per KILL-PDF. */
export function reportMoney(cents: number | null, currency: string): string {
  if (cents === null) return '';
  const symbol = currencySymbol(currency);
  const text = grouped(Math.abs(cents) / 100);
  return cents < 0 ? `${symbol}(${text})` : `${symbol}${text}`;
}

/** Same separators as the money it sits beside — one document, one convention. */
export function reportPercent(value: number | null): string {
  if (value === null) return '';
  const text = new Intl.NumberFormat(MONEY_LOCALE, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
    useGrouping: true,
  }).format(Math.abs(value));
  return value < 0 ? `(${text}%)` : `${text}%`;
}

export function fillTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => values[key] ?? match);
}
