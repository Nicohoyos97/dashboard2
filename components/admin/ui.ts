// Shared class strings for the firm portal forms (same look as the client
// settings forms — INITIAL_PROMPT.md §6 tokens).
export const inputClass =
  'h-11 w-full rounded-lg border border-line bg-card px-4 text-body text-foreground outline-none transition placeholder:text-muted-foreground/60 focus:border-brand focus:shadow-focus disabled:cursor-not-allowed disabled:bg-secondary disabled:text-muted-foreground';

export const selectClass = `${inputClass} pr-9 appearance-none bg-[url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' fill='none' stroke='%2364748b' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m4 6 4 4 4-4'/%3E%3C/svg%3E")] bg-[length:16px] bg-[right_12px_center] bg-no-repeat`;

export const textareaClass =
  'w-full rounded-lg border border-line bg-card px-4 py-3 text-body leading-[1.5] text-foreground outline-none transition placeholder:text-muted-foreground/60 focus:border-brand focus:shadow-focus';

export const labelClass = 'text-ink mb-1.5 block text-ui font-semibold';

export const primaryButton =
  'bg-blue hover:bg-blue-hover inline-flex h-11 items-center justify-center gap-2 rounded-lg px-5 text-ui font-semibold text-white transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60';

export const secondaryButton =
  'border-line bg-card text-ink hover:bg-secondary inline-flex h-11 items-center justify-center gap-2 rounded-lg border px-4 text-ui font-semibold transition disabled:cursor-not-allowed disabled:opacity-60';

export const dangerButton =
  'text-danger hover:bg-danger/10 inline-flex h-9 items-center justify-center rounded-lg px-3 text-ui font-semibold transition disabled:opacity-60';

export const card =
  'border-line bg-card rounded-2xl border p-6 shadow-card';

export const statusPill = (status: string): string =>
  status === 'active' || status === 'published'
    ? 'bg-success/10 text-success rounded-full px-2.5 py-1 text-caption font-semibold'
    : status === 'archived' || status === 'failed' || status === 'superseded'
      ? 'bg-secondary text-muted-foreground rounded-full px-2.5 py-1 text-caption font-semibold'
      : 'bg-warning/10 text-warning rounded-full px-2.5 py-1 text-caption font-semibold';
