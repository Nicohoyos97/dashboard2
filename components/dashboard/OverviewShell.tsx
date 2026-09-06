// The Overview's frame: greeting, the client's logo, the actions on the right.
//
// Lives here rather than inside the page because there are now two Overviews —
// the statement one and the sales-tax-only one (SalesTaxOverview) — and a
// client should not be able to tell which of the two they are looking at from
// the header.
export function OverviewShell({
  greeting,
  subtitle,
  logoUrl,
  actions,
  children,
}: {
  greeting: string;
  subtitle: string;
  logoUrl?: string | null;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto w-full max-w-[1200px] px-6 py-10 md:px-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-center gap-4">
          {/* The client's own logo when the firm set one. Decorative: the
              business name is already the accessible text beside it. Cropped to
              fill the frame edge to edge, like the top-bar avatar, rather than
              letterboxed inside it. */}
          {logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- client-supplied host
            <img src={logoUrl} alt="" className="border-line bg-card size-12 shrink-0 overflow-hidden rounded-xl border object-cover" />
          )}
          <div>
            <h1 className="text-ink text-[28px] font-bold tracking-[-0.01em]">{greeting}</h1>
            <p className="text-muted-foreground mt-1.5 text-[15px]">{subtitle}</p>
          </div>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
      </div>
      {children}
    </main>
  );
}

export function OverviewEmpty({ title, body }: { title: string; body: string }) {
  return (
    <section className="border-line bg-card mt-8 rounded-2xl border p-8 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <h2 className="text-ink text-[18px] font-semibold">{title}</h2>
      <p className="text-muted-foreground mt-2 max-w-[560px] text-[15px] leading-[1.55]">{body}</p>
    </section>
  );
}

/** The card every Overview section sits in. */
export function OverviewCard({ title, lede, children }: { title: string; lede?: string; children: React.ReactNode }) {
  return (
    <section className="border-line bg-card flex flex-col rounded-2xl border p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <h2 className="text-ink text-[16px] font-semibold">{title}</h2>
      {lede && <p className="text-muted-foreground mt-1 text-[13px]">{lede}</p>}
      <div className="mt-4 flex-1">{children}</div>
    </section>
  );
}
