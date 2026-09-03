import { getTranslations } from 'next-intl/server';

// Honest empty state for a statement page: no pending business, no report
// for the period, or no report at all — never a placeholder table.
export async function EmptyStatement({ kind, typeLabel, entityName }: { kind: 'pending' | 'none' | 'period'; typeLabel: string; entityName?: string }) {
  const [t, tOverview] = await Promise.all([getTranslations('Statements'), getTranslations('Overview')]);
  return (
    <section className="border-line bg-card mt-8 rounded-2xl border p-8 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <h2 className="text-ink text-[18px] font-semibold">
        {kind === 'pending' ? tOverview('pendingTitle') : kind === 'none' ? t('noReportsAtAll', { type: typeLabel }) : t('noReport', { type: typeLabel })}
      </h2>
      {kind === 'pending' && <p className="text-muted-foreground mt-2 max-w-[560px] text-[15px] leading-[1.55]">{tOverview('pendingBody')}</p>}
      {kind !== 'pending' && entityName && <p className="text-muted-foreground mt-2 text-[15px]">{entityName}</p>}
    </section>
  );
}
