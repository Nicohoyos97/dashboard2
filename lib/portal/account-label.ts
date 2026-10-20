// What the client reads as a line's name.
//
// Statements the firm prepares carry working notes in the account name —
// "Payroll (1 employee, $1,200/week × 5 Mondays, cash)" — which are how the
// figure was built, not what it is. The client reads "Payroll". The stored
// `account_name` stays exactly as printed (the firm reviews against it, and
// `source_text` has the whole line); only what the portal, the exports and
// Nick show is trimmed.
//
// The same goes for the chart-of-accounts code a bookkeeping export prints in
// front of the name — "1001- Sales", "Total for 6300 - Utilities". The code is
// how the firm files the account; the client reads "Sales" and "Utilities".

const TRAILING_NOTE = /\s*\([^()]*\)\s*$/;

// Digits, a separator, then a word: "0099 - Accounting", "8801-Delivery Costs".
// The separator is what tells a code from a name that starts with a number
// ("1099 contractors"), and the two letters after it keep "401-k match" whole.
const ACCOUNT_CODE = /^((?:total\s+(?:for\s+)?)?)\d{3,7}\s*[-–—:]\s*(?=\p{L}{2})/iu;

function withoutCode(name: string): string {
  return name.trim().replace(ACCOUNT_CODE, '$1');
}

// "(POS)" is the one parenthetical that is part of the name: it says which
// sales these are, beside "Zelle sales", not how the figure was built.
const KEPT_NOTE = /\(\s*pos\s*\)\s*$/i;

function withoutNote(name: string): string {
  let label = name.trim();
  while (TRAILING_NOTE.test(label) && !KEPT_NOTE.test(label)) {
    const next = label.replace(TRAILING_NOTE, '');
    if (next.length === 0) break;
    label = next;
  }
  return label;
}

/** The name without its account code or trailing parenthetical notes; the name itself if nothing would be left. */
export function accountLabel(name: string): string {
  return withoutNote(withoutCode(name));
}

type Labelled = { accountName: string; accountNumber?: string | null; isSection?: boolean; isTotal?: boolean };

const NUMBER = /^\d{3,7}$/;

/** The code a line carries: in its own column when extraction split it off, else at the front of its name. */
function codeOf(line: Labelled): string | null {
  const own = line.accountNumber?.trim() ?? '';
  if (NUMBER.test(own)) return own;
  return ACCOUNT_CODE.test(line.accountName.trim()) ? (/\d{3,7}/.exec(line.accountName)?.[0] ?? null) : null;
}

/**
 * Codes come as a system: a statement carries them on its accounts or it does
 * not. Reading them off only where most of the amount lines have one keeps a
 * lone "1099-NEC contractors" in an uncoded statement exactly as printed.
 *
 * A code counts wherever the line keeps it. Extraction often splits it off an
 * account ("6300" | "Utilities") and leaves it inside the total that closes
 * the account ("Total for 6300 - Utilities") — counting names alone, such a
 * statement read as uncoded and every one of those totals kept its code.
 */
function isCoded(lines: readonly Labelled[]): boolean {
  const accounts = lines.filter((line) => !line.isSection && !line.isTotal);
  const coded = accounts.filter((line) => codeOf(line) !== null).length;
  return coded > 0 && coded * 2 >= accounts.length;
}

/**
 * Labels for one statement's lines. When the note is what tells two lines
 * apart — "Food (bank)" and "Food (cash)" — both keep it: two rows reading
 * "Food" would be a statement the client cannot check.
 */
export function withAccountLabels<T extends Labelled>(lines: readonly T[]): T[] {
  // Even in a statement that is not coded as a whole, a total names the code of
  // an account printed above it: "Total for 9020 - Vehicle expense" closes 9020.
  // Only codes extraction split into their own column: a name that merely
  // starts with digits ("1099-NEC contractors") must not reach its total.
  const codes = new Set(lines.flatMap((line) => (NUMBER.test(line.accountNumber?.trim() ?? '') ? [line.accountNumber!.trim()] : [])));
  const closesKnownCode = (line: T) => line.isTotal && [...codes].some((code) => new RegExp(`^(?:total\\s+(?:for\\s+)?)?${code}\\b`, 'i').test(line.accountName.trim()));
  const coded = isCoded(lines);
  const named = lines.map((line) => (coded || closesKnownCode(line) ? { ...line, accountName: withoutCode(line.accountName) } : line));
  const counts = new Map<string, number>();
  for (const line of named) {
    const label = withoutNote(line.accountName).toLowerCase();
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return named.map((line) => {
    const label = withoutNote(line.accountName);
    return (counts.get(label.toLowerCase()) ?? 0) > 1 ? line : { ...line, accountName: label };
  });
}
