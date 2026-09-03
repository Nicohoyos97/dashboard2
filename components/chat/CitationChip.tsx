'use client';

import { FileText } from 'lucide-react';

import { Link } from '@/i18n/navigation';
import type { CitationRecord } from '@/lib/ai/nick/types';

// A source chip (spec §10): `Profit & Loss · Jan–Jun 2026 · Page 3 · Payroll
// Expense`. Links to the statement page for the cited period when one exists.
const chipClass =
  'bg-blue-pale text-blue inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 align-baseline text-[11.5px] font-semibold leading-[1.4] whitespace-normal';

export function CitationChip({
  citation,
  compact = false,
}: {
  citation: CitationRecord;
  compact?: boolean;
}) {
  const text = compact ? citation.key.replace('c', '') : citation.label;
  const inner = (
    <>
      <FileText className="size-3 shrink-0" aria-hidden="true" />
      <span className={compact ? 'tabular-nums' : 'truncate'}>{text}</span>
    </>
  );
  if (citation.href && citation.href.startsWith('/') && !citation.href.startsWith('/api/')) {
    return (
      <Link
        href={citation.href}
        className={`${chipClass} hover:underline`}
        title={citation.label}
        aria-label={citation.label}
      >
        {inner}
      </Link>
    );
  }
  return (
    <span className={chipClass} title={citation.label} aria-label={citation.label}>
      {inner}
    </span>
  );
}
