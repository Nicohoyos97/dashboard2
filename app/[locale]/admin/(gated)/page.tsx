// Firm dashboard (INITIAL_PROMPT.md §8). Phase 1 ships the shell with honest
// counts from real queries; the operational cards (recent uploads, processing
// failures, reports awaiting review, …) arrive with the ingestion pipeline in
// Phase 2 and are not faked here (§3 "Product").
import { getTranslations } from 'next-intl/server';

import { requireFirmMember } from '@/lib/auth/requireFirm';
import { createClient } from '@/lib/supabase/server';

async function count(
  supabase: Awaited<ReturnType<typeof createClient>>,
  table: 'clients' | 'business_entities' | 'entity_memberships' | 'documents',
  filter?: { column: string; value: string },
): Promise<number> {
  let query = supabase.from(table).select('*', { count: 'exact', head: true });
  if (filter) query = query.eq(filter.column, filter.value);
  const { count: n } = await query;
  return n ?? 0;
}

export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ denied?: string }>;
}) {
  const firm = await requireFirmMember();
  const [t, params] = await Promise.all([getTranslations('Admin'), searchParams]);
  const supabase = await createClient();

  const [clients, entities, memberships, needsReview] = await Promise.all([
    count(supabase, 'clients', { column: 'status', value: 'active' }),
    count(supabase, 'business_entities', { column: 'status', value: 'active' }),
    count(supabase, 'entity_memberships'),
    count(supabase, 'documents', { column: 'status', value: 'needs_review' }),
  ]);

  const stats = [
    { label: t('statClients'), value: clients },
    { label: t('statBusinesses'), value: entities },
    { label: t('statLinkedUsers'), value: memberships },
    { label: t('statNeedsReview'), value: needsReview },
  ];

  return (
    <main className="mx-auto w-full max-w-[1200px] px-6 py-10 md:px-10">
      <h1 className="text-ink text-[28px] font-bold tracking-[-0.01em]">{t('dashboardTitle')}</h1>
      <p className="text-muted-foreground mt-1.5 text-[15px]">
        {firm.role === 'master_admin' ? t('dashboardLedeAdmin') : t('dashboardLedeStaff')}
      </p>

      {params.denied === '1' && (
        <p
          role="alert"
          className="bg-warning/10 text-ink border-warning/40 mt-6 rounded-xl border px-4 py-3 text-[14px]"
        >
          {t('deniedStaff')}
        </p>
      )}

      <section aria-label={t('statsLabel')} className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <div
            key={s.label}
            className="border-line bg-card rounded-2xl border p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
          >
            <p className="text-muted-foreground text-[13px] font-medium">{s.label}</p>
            <p className="text-ink mt-2 text-[30px] leading-none font-bold tracking-[-0.02em]">
              {s.value}
            </p>
          </div>
        ))}
      </section>

      <section className="border-line bg-card mt-6 rounded-2xl border p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <h2 className="text-ink text-[17px] font-semibold">{t('nextTitle')}</h2>
        <p className="text-muted-foreground mt-2 max-w-[640px] text-[14.5px] leading-[1.55]">
          {t('nextBody')}
        </p>
      </section>
    </main>
  );
}
