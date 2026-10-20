'use client';

// The report period, the way QuickBooks asks for it: a named period (last
// month, last quarter, last year…) and the two dates it stands for, each one
// opening a calendar. Changing either date makes the period "Custom", and the
// page runs the report for exactly those days — the server adds a range up
// from the published statements and, inside a month, from its General Ledger
// (lib/reports/range.ts), or says why it cannot.
//
// The dates are native date inputs: they bring the platform's own calendar,
// keyboard entry and locale, and cost no JavaScript. A click anywhere on the
// field opens the calendar, as QuickBooks' does; typing still works, and the
// report runs once a typed date is whole (on Enter, on leaving the field, or
// after a pause) rather than on every keystroke.
import { ChevronDown } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { useId, useRef, useState, useTransition } from 'react';

import { inputClass } from '@/components/admin/ui';
import { usePathname, useRouter } from '@/i18n/navigation';

export type PeriodBarProps = {
  /** Named periods resolved to `start_end` on the server, in the business's own calendar. */
  presets: { value: string; label: string }[];
  from: string;
  to: string;
};

const CUSTOM = 'custom';
const TYPING_PAUSE_MS = 500;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** A date the browser has finished reading: four-digit years only, so "0002" on the way to "2026" never runs a report. */
function complete(date: string): boolean {
  return ISO.test(date) && date >= '1900-01-01' && date <= '2999-12-31';
}

function openCalendar(input: HTMLInputElement): void {
  try {
    input.showPicker();
  } catch {
    // Not offered here (an older browser, or no user gesture): the field still takes typing.
  }
}

export function ReportPeriodBar({ presets, from, to }: PeriodBarProps) {
  const t = useTranslations('Overview');
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const [pending, startTransition] = useTransition();
  const fromRef = useRef<HTMLInputElement>(null);
  // Labels point at their control by id rather than wrapping it: wrapped, the
  // select's name would take in every option's text.
  const id = useId();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // What the fields show: the selection the server sent, until the reader edits it.
  const selected = `${from}_${to}`;
  const [draft, setDraft] = useState({ from, to, base: selected });
  if (draft.base !== selected) setDraft({ from, to, base: selected });

  function run(start: string, end: string) {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (`${start}_${end}` === selected) return;
    // Every other param survives except the ones that belong to the old range:
    // an account opened on it, a page of its table.
    const next = new URLSearchParams(search.toString());
    next.set('period', `${start}_${end}`);
    next.delete('line');
    next.delete('page');
    startTransition(() => router.push(`${pathname}?${next.toString()}`));
  }

  function edit(field: 'from' | 'to', value: string, when: 'now' | 'pause') {
    let start = field === 'from' ? value : draft.from;
    let end = field === 'to' ? value : draft.to;
    // As QuickBooks does: moving one date past the other brings the other along.
    if (complete(start) && complete(end) && start > end) {
      if (field === 'from') end = start;
      else start = end;
    }
    setDraft({ from: start, to: end, base: selected });
    if (timer.current) clearTimeout(timer.current);
    if (!complete(start) || !complete(end)) return;
    if (when === 'now') run(start, end);
    else timer.current = setTimeout(() => run(start, end), TYPING_PAUSE_MS);
  }

  const dateField = (field: 'from' | 'to') => (
    // On a phone the two dates share a row under the named period.
    <div className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-none">
      <label htmlFor={`${id}-${field}`} className="text-muted-foreground text-caption font-medium">
        {t(field === 'from' ? 'periodFrom' : 'periodTo')}
      </label>
      <input
        id={`${id}-${field}`}
        ref={field === 'from' ? fromRef : undefined}
        type="date"
        value={draft[field]}
        onChange={(event) => edit(field, event.target.value, 'pause')}
        onBlur={(event) => edit(field, event.target.value, 'now')}
        onKeyDown={(event) => {
          if (event.key === 'Enter') edit(field, event.currentTarget.value, 'now');
        }}
        onClick={(event) => openCalendar(event.currentTarget)}
        className={`${inputClass} text-ui h-10 w-full cursor-pointer px-3 tabular-nums sm:w-[168px]`}
      />
    </div>
  );

  return (
    <div
      role="group"
      aria-label={t('reportPeriod')}
      aria-busy={pending}
      className={`flex w-full max-w-full flex-wrap items-end gap-2.5 transition-opacity sm:w-auto ${pending ? 'opacity-70' : ''}`}
    >
      <div className="flex w-full min-w-0 flex-col gap-1 sm:w-auto">
        <label htmlFor={`${id}-period`} className="text-muted-foreground text-caption font-medium">
          {t('reportPeriod')}
        </label>
        <div className="relative">
          <select
            id={`${id}-period`}
            // Named after the dates on screen, so a preset picked shows at once and an edited date reads Custom.
            value={
              presets.find((choice) => choice.value === `${draft.from}_${draft.to}`)?.value ??
              CUSTOM
            }
            onChange={(event) => {
              const value = event.target.value;
              if (value === CUSTOM) {
                fromRef.current?.focus();
                if (fromRef.current) openCalendar(fromRef.current);
                return;
              }
              const [start, end] = value.split('_');
              if (start && end) {
                setDraft({ from: start, to: end, base: selected });
                run(start, end);
              }
            }}
            className={`${inputClass} text-ui h-10 w-full cursor-pointer appearance-none pr-9 pl-3 sm:w-[200px]`}
          >
            {presets.map((choice) => (
              <option key={choice.value} value={choice.value}>
                {choice.label}
              </option>
            ))}
            <option value={CUSTOM}>{t('periodCustomOption')}</option>
          </select>
          <ChevronDown
            className="text-muted-foreground pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2"
            aria-hidden="true"
          />
        </div>
      </div>
      {dateField('from')}
      {dateField('to')}
      <span role="status" className="sr-only">
        {pending ? t('periodUpdating') : ''}
      </span>
    </div>
  );
}
