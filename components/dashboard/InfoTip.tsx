'use client';

import { Info } from 'lucide-react';
import { Tooltip } from 'radix-ui';

// "How is this calculated" — an accessible tooltip (keyboard focusable,
// announced) rather than a title attribute.
export function InfoTip({ text, label }: { text: string; label: string }) {
  return (
    <Tooltip.Provider delayDuration={150}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <button
            type="button"
            aria-label={label}
            className="text-muted-foreground hover:text-ink focus-visible:ring-blue/40 inline-flex size-6 items-center justify-center rounded-full outline-none focus-visible:ring-3"
          >
            <Info className="size-3.5" aria-hidden="true" />
          </button>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            side="top"
            sideOffset={6}
            className="border-line bg-card text-ink z-50 max-w-[260px] rounded-xl border px-3 py-2 text-[12.5px] leading-[1.45] shadow-[0_8px_24px_rgba(15,23,42,0.12)]"
          >
            {text}
            <Tooltip.Arrow className="fill-card" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}
