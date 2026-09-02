'use client';

// Business switcher for users who belong to more than one entity
// (INITIAL_PROMPT.md §7). Picking one calls the switchEntity Server Action,
// which validates membership and sets the hb_entity cookie; the refresh makes
// every report, document and Nick context follow. Radix DropdownMenu gives
// keyboard navigation + roving focus for free.
import { Building2, Check, ChevronsUpDown } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { DropdownMenu } from 'radix-ui';
import { useTransition } from 'react';

import type { CurrentEntity } from '@/lib/auth/getCurrentEntity';
import { switchEntity } from '@/lib/entities/actions';

export function EntitySwitcher({
  entities,
  currentId,
}: {
  entities: CurrentEntity[];
  currentId: string;
}) {
  const t = useTranslations('Shell');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const current = entities.find((e) => e.id === currentId) ?? entities[0];

  function choose(id: string) {
    if (id === currentId) return;
    startTransition(async () => {
      const res = await switchEntity({ entityId: id });
      if (res.ok) router.refresh();
    });
  }

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label={t('switchBusiness')}
          disabled={isPending}
          className="border-line bg-card hover:bg-secondary focus-visible:ring-blue/40 flex w-full items-center gap-2.5 rounded-xl border px-3 py-2 text-left outline-none focus-visible:ring-3 disabled:opacity-60"
        >
          <span className="bg-blue-pale text-blue flex size-8 shrink-0 items-center justify-center rounded-lg">
            <Building2 className="size-4" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="text-muted-foreground block text-[11px] font-medium">
              {t('currentBusiness')}
            </span>
            <span className="text-ink block truncate text-[13.5px] font-semibold">
              {current?.name}
            </span>
          </span>
          <ChevronsUpDown className="text-muted-foreground size-4 shrink-0" aria-hidden="true" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          side="top"
          align="start"
          sideOffset={6}
          className="border-line bg-card z-50 w-[var(--radix-dropdown-menu-trigger-width)] min-w-[220px] rounded-xl border p-1.5 shadow-[0_8px_24px_rgba(15,23,42,0.12)]"
        >
          <DropdownMenu.Label className="text-muted-foreground px-2 py-1.5 text-[11px] font-semibold tracking-[0.08em] uppercase">
            {t('switchBusiness')}
          </DropdownMenu.Label>
          {entities.map((e) => (
            <DropdownMenu.Item
              key={e.id}
              onSelect={() => choose(e.id)}
              className="text-ink data-[highlighted]:bg-blue-pale data-[highlighted]:text-blue flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-[13.5px] outline-none"
            >
              <span className="flex-1 truncate">{e.name}</span>
              {e.id === currentId && <Check className="size-4" aria-hidden="true" />}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
