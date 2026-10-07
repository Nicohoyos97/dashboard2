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

type Labelled = { accountName: string; isSection?: boolean; isTotal?: boolean };

/**
 * Codes come as a system: a statement carries them on its accounts or it does
 * not. Reading them off only where most of the amount lines have one keeps a
 * lone "1099-NEC contractors" in an uncoded statement exactly as printed.
 */
function isCoded(lines: readonly Labelled[]): boolean {
  const accounts = lines.filter((line) => !line.isSection && !line.isTotal);
  const coded = accounts.filter((line) => ACCOUNT_CODE.test(line.accountName.trim())).length;
  return coded > 0 && coded * 2 >= accounts.length;
}

/**
 * Labels for one statement's lines. When the note is what tells two lines
 * apart — "Food (bank)" and "Food (cash)" — both keep it: two rows reading
 * "Food" would be a statement the client cannot check.
 */
export function withAccountLabels<T extends Labelled>(lines: readonly T[]): T[] {
  const named = isCoded(lines) ? lines.map((line) => ({ ...line, accountName: withoutCode(line.accountName) })) : lines;
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
