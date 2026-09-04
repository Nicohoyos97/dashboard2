'use client';

// The reporting-period control (§7), in the shape an owner asks the question:
// "this quarter", "last year", or a range they pick themselves.
//
// Two things are kept apart on purpose. A preset is a calendar range, and it is
// offered whether or not the firm has published a statement covering it — the
// ones with nothing published say so, and the page then shows its own honest
// empty state rather than estimating from a longer period. The published
// periods stay listed underneath, because those are the ranges that certainly
// have figures behind them.
//
// The custom range uses native date inputs: they bring the platform's own
// calendar and keyboard handling, which no added dependency would improve on.
import { CalendarDays, Check, ChevronDown } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Popover } from 'radix-ui';
import { useState } from 'react';

import { inputClass, primaryButton, secondaryButton } from '@/components/admin/ui';
import { usePathname, useRouter } from '@/i18n/navigation';

export type PeriodChoice = {
  /** `start_end`, the value the page reads from the URL. */
  value: string;
  label: string;
  /** False when no published statement covers exactly this range. */
  published: boolean;
};

export function PeriodPicker({
  presets,
  published,
  current,
  currentLabel,
  customFrom,
  customTo,
}: {
  presets: PeriodChoice[];
  published: PeriodChoice[];
  current: string;
  currentLabel: string;
  customFrom: string;
  customTo: string;
}) {
  const t = useTranslations('Overview');
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [showCustom, setShowCustom] = useState(false);
  const [from, setFrom] = useState(customFrom);
  const [to, setTo] = useState(customTo);

  function go(value: string) {
    setOpen(false);
    setShowCustom(false);
    router.push(`${pathname}?period=${value}`);
  }

  const rangeInvalid = from === '' || to === '' || from > to;

  return (
    <label className="flex items-center gap-2 text-[13.5px]">
      <span className="text-muted-foreground font-medium">{t('periodLabel')}</span>
      <Popover.Root
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setShowCustom(false);
        }}
      >
        <Popover.Trigger asChild>
          <button
            type="button"
            aria-label={t('periodLabel')}
            className={`${secondaryButton} h-10 min-w-[220px] justify-between`}
          >
            <span className="flex items-center gap-2 truncate">
              <CalendarDays className="text-muted-foreground size-4 shrink-0" aria-hidden="true" />
              <span className="truncate">{currentLabel}</span>
            </span>
            <ChevronDown className="size-4 shrink-0 opacity-70" aria-hidden="true" />
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            align="end"
            sideOffset={6}
            className="border-line bg-card z-50 max-h-[min(70vh,520px)] w-[300px] overflow-y-auto rounded-xl border p-1.5 shadow-[0_8px_24px_rgba(15,23,42,0.12)]"
          >
            {presets.map((choice) => (
              <Row
                key={choice.value}
                choice={choice}
                selected={choice.value === current}
                onSelect={go}
                unavailableNote={t('periodNoReport')}
              />
            ))}

            <button
              type="button"
              onClick={() => setShowCustom((v) => !v)}
              aria-expanded={showCustom}
              className="text-ink hover:bg-secondary flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-[13.5px] outline-none"
            >
              {t('periodCustom')}
              <ChevronDown
                className={`size-4 opacity-70 transition ${showCustom ? 'rotate-180' : ''}`}
                aria-hidden="true"
              />
            </button>

            {showCustom && (
              <div className="border-line-soft mt-1 space-y-2 rounded-lg border p-2.5">
                <div className="grid grid-cols-2 gap-2">
                  <span>
                    <span className="text-muted-foreground mb-1 block text-[12px] font-medium">
                      {t('periodFrom')}
                    </span>
                    <input
                      type="date"
                      value={from}
                      max={to || undefined}
                      onChange={(e) => setFrom(e.target.value)}
                      aria-label={t('periodFrom')}
                      className={`${inputClass} h-9 text-[13px]`}
                    />
                  </span>
                  <span>
                    <span className="text-muted-foreground mb-1 block text-[12px] font-medium">
                      {t('periodTo')}
                    </span>
                    <input
                      type="date"
                      value={to}
                      min={from || undefined}
                      onChange={(e) => setTo(e.target.value)}
                      aria-label={t('periodTo')}
                      className={`${inputClass} h-9 text-[13px]`}
                    />
                  </span>
                </div>
                <button
                  type="button"
                  disabled={rangeInvalid}
                  onClick={() => go(`${from}_${to}`)}
                  className={`${primaryButton} h-9 w-full disabled:cursor-not-allowed disabled:opacity-50`}
                >
                  {t('periodApply')}
                </button>
              </div>
            )}

            {published.length > 0 && (
              <>
                <p className="text-muted-foreground px-2.5 pt-3 pb-1 text-[11px] font-semibold tracking-[0.08em] uppercase">
                  {t('periodPublished')}
                </p>
                {published.map((choice) => (
                  <Row
                    key={choice.value}
                    choice={choice}
                    selected={choice.value === current}
                    onSelect={go}
                    unavailableNote={t('periodNoReport')}
                  />
                ))}
              </>
            )}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </label>
  );
}

function Row({
  choice,
  selected,
  onSelect,
  unavailableNote,
}: {
  choice: PeriodChoice;
  selected: boolean;
  onSelect: (value: string) => void;
  unavailableNote: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(choice.value)}
      aria-current={selected ? 'true' : undefined}
      className="text-ink hover:bg-secondary flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left text-[13.5px] outline-none"
    >
      <Check
        className={`mt-0.5 size-4 shrink-0 ${selected ? 'text-blue' : 'opacity-0'}`}
        aria-hidden="true"
      />
      <span className="min-w-0">
        <span className={`block truncate ${selected ? 'font-semibold' : ''}`}>{choice.label}</span>
        {!choice.published && (
          <span className="text-muted-foreground block text-[12px] leading-[1.4]">
            {unavailableNote}
          </span>
        )}
      </span>
    </button>
  );
}
