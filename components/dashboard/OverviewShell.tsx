import { PortalPage } from '@/components/portal/PortalPage';

// The Overview's frame: greeting, the client's logo, then the shared toolbar.
//
// Lives here rather than inside the page because there are now two Overviews —
// the statement one and the sales-tax-only one (SalesTaxOverview) — and a
// client should not be able to tell which of the two they are looking at from
// the header.
export function OverviewShell({
  greeting,
  subtitle,
  logoUrl,
  filters,
  actions,
  children,
}: {
  greeting: string;
  subtitle: string;
  logoUrl?: string | null;
  filters?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <PortalPage
      title={greeting}
      lede={subtitle}
      filters={filters}
      actions={actions}
      // The client's own logo when the firm set one. Decorative: the business
      // name is already the accessible text beside it. Cropped to fill the
      // frame edge to edge, like the top-bar avatar, rather than letterboxed.
      leading={
        logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- client-supplied host
          <img src={logoUrl} alt="" className="border-line bg-card size-12 shrink-0 overflow-hidden rounded-xl border object-cover" />
        ) : undefined
      }
    >
      {children}
    </PortalPage>
  );
}

export function OverviewEmpty({ title, body }: { title: string; body: string }) {
  return (
    <section className="border-line bg-card mt-8 rounded-2xl border p-8 shadow-card">
      <h2 className="text-ink text-heading font-semibold">{title}</h2>
      <p className="text-muted-foreground mt-2 max-w-[560px] text-body leading-[1.55]">{body}</p>
    </section>
  );
}

/** The card every Overview section sits in. */
export function OverviewCard({ title, lede, children }: { title: string; lede?: string; children: React.ReactNode }) {
  return (
    <section className="border-line bg-card flex flex-col rounded-2xl border p-5 shadow-card">
      <h2 className="text-ink text-title font-semibold">{title}</h2>
      {lede && <p className="text-muted-foreground mt-1 text-small">{lede}</p>}
      <div className="mt-4 flex-1">{children}</div>
    </section>
  );
}
