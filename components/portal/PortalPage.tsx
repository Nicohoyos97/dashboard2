import { getTranslations } from 'next-intl/server';

// The one page frame every client-portal page uses: the title, one line of
// context, and — when the page has any — a toolbar under them, with what
// filters the page (granularity, period, tax year) on the left and what you
// can take away from it (export, download) on the right.
//
// The toolbar always sits under the title rather than beside it. Beside it,
// the controls landed wherever the title's width left room — right of it on
// one page, wrapped under it on the next — so the same picker moved around as
// the owner went from page to page.
export function PortalPage({
  title,
  lede,
  leading,
  filters,
  controls,
  actions,
  children,
}: {
  title: string;
  lede?: string;
  /** Left of the title: the client's logo on the Overview. */
  leading?: React.ReactNode;
  filters?: React.ReactNode;
  /** @deprecated Same slot as `filters`; kept for the pages that predate it. */
  controls?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const left = filters ?? controls;
  return (
    <main className="mx-auto w-full max-w-[1200px] px-4 pt-6 pb-12 sm:px-6 md:px-10 md:pt-9">
      <PageHeading title={title} lede={lede} leading={leading} />
      {(left || actions) && (
        <div className="mt-5 flex flex-wrap items-center gap-2.5 print:hidden">
          {left && <div className="flex max-w-full min-w-0 flex-wrap items-center gap-2.5">{left}</div>}
          {actions && <div className="flex flex-wrap items-center gap-2.5 sm:ml-auto">{actions}</div>}
        </div>
      )}
      {children}
    </main>
  );
}

/** The title block alone, for a page whose frame is otherwise its own (Ask Nick). */
export function PageHeading({ title, lede, leading }: { title: string; lede?: string | undefined; leading?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-4">
      {leading}
      <div className="min-w-0">
        <h1 className="text-ink text-display leading-tight font-bold tracking-[-0.02em] text-balance">{title}</h1>
        {lede && <p className="text-muted-foreground mt-1 text-body text-pretty">{lede}</p>}
      </div>
    </div>
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
    <section className="border-line bg-card mt-8 rounded-2xl border p-8 shadow-card">
      <h2 className="text-ink text-heading font-semibold">{kind === 'pending' ? t('pendingTitle') : (title ?? t('emptyTitle'))}</h2>
      <p className="text-muted-foreground mt-2 max-w-[560px] text-body leading-[1.55]">{kind === 'pending' ? t('pendingBody') : (body ?? '')}</p>
    </section>
  );
}
