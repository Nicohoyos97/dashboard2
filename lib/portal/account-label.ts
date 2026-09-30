// What the client reads as a line's name.
//
// Statements the firm prepares carry working notes in the account name —
// "Payroll (1 employee, $1,200/week × 5 Mondays, cash)" — which are how the
// figure was built, not what it is. The client reads "Payroll". The stored
// `account_name` stays exactly as printed (the firm reviews against it, and
// `source_text` has the whole line); only what the portal, the exports and
// Nick show is trimmed.

const TRAILING_NOTE = /\s*\([^()]*\)\s*$/;

/** The name without its trailing parenthetical notes; the name itself if nothing would be left. */
export function accountLabel(name: string): string {
  let label = name.trim();
  while (TRAILING_NOTE.test(label)) {
    const next = label.replace(TRAILING_NOTE, '');
    if (next.length === 0) break;
    label = next;
  }
  return label;
}

/**
 * Labels for one statement's lines. When the note is what tells two lines
 * apart — "Food (bank)" and "Food (cash)" — both keep it: two rows reading
 * "Food" would be a statement the client cannot check.
 */
export function withAccountLabels<T extends { accountName: string }>(lines: readonly T[]): T[] {
  const counts = new Map<string, number>();
  for (const line of lines) {
    const label = accountLabel(line.accountName).toLowerCase();
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return lines.map((line) => {
    const label = accountLabel(line.accountName);
    return (counts.get(label.toLowerCase()) ?? 0) > 1 ? line : { ...line, accountName: label };
  });
}
