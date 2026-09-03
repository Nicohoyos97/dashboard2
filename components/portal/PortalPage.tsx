import { getTranslations } from 'next-intl/server';

// Page frame shared by the Phase 5 client-portal pages (Expenses, Income
// Taxes, Sales Taxes), matching the header the Overview and statement pages
// already use: title, one line of context, and the page's own controls on the
// right. Kept here so a new module does not restate the layout.
export function PortalPage({
  title,
  lede,
  controls,
  children,
}: {
  title: string;
  lede: string;
  controls?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto w-full max-w-[1200px] px-6 py-10 md:px-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-ink text-[28px] font-bold tracking-[-0.01em]">{title}</h1>
          <p className="text-muted-foreground mt-1.5 text-[15px]">{lede}</p>
        </div>
        {controls && <div className="flex flex-wrap items-center gap-3">{controls}</div>}
      </div>
      {children}
    </main>
  );
}

/**
 * Honest empty state: either the user has no business assigned yet, or the firm
 * has published nothing for this module. Never a placeholder table or a zero.
 */
export async function PortalEmpty({
  kind,
  title,
  body,
}: {
  kind: 'pending' | 'none';
  title?: string;
  body?: string;
}) {
  const t = await getTranslations('Overview');
  return (
    <section className="border-line bg-card mt-8 rounded-2xl border p-8 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <h2 className="text-ink text-[18px] font-semibold">{kind === 'pending' ? t('pendingTitle') : (title ?? t('emptyTitle'))}</h2>
      <p className="text-muted-foreground mt-2 max-w-[560px] text-[15px] leading-[1.55]">{kind === 'pending' ? t('pendingBody') : (body ?? '')}</p>
    </section>
  );
}
