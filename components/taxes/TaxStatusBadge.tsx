import { getTranslations } from 'next-intl/server';

import type { FilingStatus, TaxStatus } from '@/lib/reports/taxes';

// The firm's own label on a figure (§7): only `firm_confirmed` reads as final,
// so it is the only one shown in the confident tone. Everything else stays
// visibly provisional — the badge is the honesty of the page.
const TONE: Record<TaxStatus, string> = {
  firm_confirmed: 'bg-success/10 text-success',
  paid: 'bg-success/10 text-success',
  payable: 'bg-warning/10 text-warning',
  estimated: 'bg-secondary text-muted-foreground',
  pending_review: 'bg-warning/10 text-warning',
};

export async function TaxStatusBadge({ status }: { status: TaxStatus }) {
  const t = await getTranslations('Taxes');
  return <span className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-[12px] font-semibold ${TONE[status]}`}>{t(`status_${status}`)}</span>;
}

export async function FilingBadge({ status }: { status: FilingStatus | null }) {
  const t = await getTranslations('Taxes');
  if (status === null) return <span className="text-muted-foreground text-[12.5px]">{t('filing_unknown')}</span>;
  const tone = status === 'filed' || status === 'amended' ? 'text-success' : status === 'extended' ? 'text-warning' : 'text-muted-foreground';
  return <span className={`text-[12.5px] font-medium ${tone}`}>{t(`filing_${status}`)}</span>;
}
