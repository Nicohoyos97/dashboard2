// A conversation is named after the first words the person asked. Pure and
// client-safe so the history list can title an optimistic row the same way
// the server does.
export const TITLE_MAX_CHARS = 56;
const MIN_WORD_CUT = 24;

export function titleFromMessage(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= TITLE_MAX_CHARS) return clean;
  const cut = clean.slice(0, TITLE_MAX_CHARS);
  const boundary = cut.lastIndexOf(' ');
  return `${(boundary > MIN_WORD_CUT ? cut.slice(0, boundary) : cut).trimEnd()}…`;
}

/** Every keyword must appear in the title (case-insensitive); an empty query matches everything. */
export function matchesKeywords(title: string, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = title.toLowerCase();
  return words.every((word) => haystack.includes(word));
}
