// Firm dashboard (INITIAL_PROMPT.md §8): directory sizes, the review pipeline
// at a glance, upcoming client obligations and the latest uploads. Every
// figure is a live count through RLS (firm member at aal2); nothing is faked.
import { getLocale, getTranslations } from 'next-intl/server';

import { card, statusPill } from '@/components/admin/ui';
import { Link } from '@/i18n/navigation';
import { requireFirmMember } from '@/lib/auth/requireFirm';
import { createClient } from '@/lib/supabase/server';
import { formatPeriod } from '@/lib/utils/dates';

type Db = Awaited<ReturnType<typeof createClient>>;
type Table = 'clients' | 'business_entities' | 'entity_memberships' | 'documents' | 'document_processing_jobs' | 'reminders';
type Filter = { column: string; op: 'eq' | 'gte' | 'lte'; value: string };

async function count(supabase: Db, table: Table, filters: Filter[] = []): Promise<number> {
  let query = supabase.from(table).select('*', { count: 'exact', head: true });
  for (const f of filters) {
    query = f.op === 'eq' ? query.eq(f.column, f.value) : f.op === 'gte' ? query.gte(f.column, f.value) : query.lte(f.column, f.value);
  }
  const { count: n } = await query;
  return n ?? 0;
}

export default async function AdminDashboardPage({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const firm = await requireFirmMember();
  const [t, locale, params] = await Promise.all([getTranslations('Admin'), getLocale(), searchParams]);
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);
  const in30 = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
  const since30 = new Date(Date.now() - 30 * 86_400_000).toISOString();

  const [clients, entities, memberships, needsReview, ready, failed, published30, dueSoon, { data: recent }] =
    await Promise.all([
      count(supabase, 'clients', [{ column: 'status', op: 'eq', value: 'active' }]),
      count(supabase, 'business_entities', [{ column: 'status', op: 'eq', value: 'active' }]),
      count(supabase, 'entity_memberships'),
      count(supabase, 'documents', [{ column: 'status', op: 'eq', value: 'needs_review' }]),
      count(supabase, 'documents', [{ column: 'status', op: 'eq', value: 'reconciled' }]),
      count(supabase, 'document_processing_jobs', [{ column: 'status', op: 'eq', value: 'failed' }]),
      count(supabase, 'documents', [{ column: 'status', op: 'eq', value: 'published' }, { column: 'published_at', op: 'gte', value: since30 }]),
      count(supabase, 'reminders', [{ column: 'due_date', op: 'gte', value: today }, { column: 'due_date', op: 'lte', value: in30 }]),
      supabase
        .from('documents')
        .select('id, title, status, period_start, period_end, updated_at, business_entities ( name )')
        .order('updated_at', { ascending: false })
        .limit(8),
    ]);

  const directory = [
    { label: t('statClients'), value: clients, href: '/admin/clients' },
    { label: t('statBusinesses'), value: entities, href: '/admin/clients' },
    { label: t('statLinkedUsers'), value: memberships, href: '/admin/clients' },
    { label: t('obligationsSoon'), value: dueSoon, href: '/admin/documents' },
  ];
  const pipeline = [
    { label: t('statNeedsReview'), value: needsReview, href: '/admin/documents?status=needs_review', tone: needsReview > 0 ? 'text-warning' : 'text-ink' },
    { label: t('statReadyToPublish'), value: ready, href: '/admin/documents?status=reconciled', tone: ready > 0 ? 'text-blue' : 'text-ink' },
    { label: t('statFailed'), value: failed, href: '/admin/documents?status=failed', tone: failed > 0 ? 'text-danger' : 'text-ink' },
    { label: t('statPublished30'), value: published30, href: '/admin/documents?status=published', tone: 'text-ink' },
  ];
  const dateFmt = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });

  return (
    <main className="mx-auto w-full max-w-[1200px] px-6 py-10 md:px-10">
      <h1 className="text-ink text-[28px] font-bold tracking-[-0.01em]">{t('dashboardTitle')}</h1>
      <p className="text-muted-foreground mt-1.5 text-[15px]">
        {firm.role === 'master_admin' ? t('dashboardLedeAdmin') : t('dashboardLedeStaff')}
      </p>

      {params.denied === '1' && (
        <p role="alert" className="bg-warning/10 text-ink border-warning/40 mt-6 rounded-xl border px-4 py-3 text-[14px]">
          {t('deniedStaff')}
        </p>
      )}

      <section aria-label={t('statsLabel')} className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[...pipeline, ...directory].map((s) => (
          <Link key={s.label} href={s.href} className={`${card} hover:border-blue/40 block transition`}>
            <p className="text-muted-foreground text-[13px] font-medium">{s.label}</p>
            <p className={`mt-2 text-[30px] leading-none font-bold tracking-[-0.02em] ${'tone' in s ? s.tone : 'text-ink'}`}>{s.value}</p>
          </Link>
        ))}
      </section>

      <section className={`${card} mt-6 p-0`}>
        <div className="flex items-center justify-between px-6 pt-5">
          <h2 className="text-ink text-[17px] font-semibold">{t('recentUploads')}</h2>
          <Link href="/admin/documents" className="text-blue text-[13.5px] font-semibold hover:underline">
            {t('openQueue')}
          </Link>
        </div>
        {(recent ?? []).length === 0 ? (
          <p className="text-muted-foreground px-6 pt-2 pb-5 text-[14px]">{t('noRecentUploads')}</p>
        ) : (
          <ul className="divide-line mt-3 divide-y">
            {(recent ?? []).map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-3 px-6 py-3 text-[14px]">
                <Link href={`/admin/documents/${d.id}`} className="text-ink hover:text-blue min-w-0 flex-1 truncate font-semibold">
                  {d.title}
                </Link>
                <span className="text-muted-foreground">{d.business_entities?.name ?? '—'}</span>
                <span className="text-muted-foreground">{formatPeriod(d.period_start, d.period_end, locale)}</span>
                <span className={statusPill(d.status)}>{t(`status_${d.status}`)}</span>
                <span className="text-muted-foreground w-[110px] text-right text-[12.5px]">{dateFmt.format(new Date(d.updated_at))}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={`${card} mt-6`}>
        <h2 className="text-ink text-[17px] font-semibold">{t('nextTitle')}</h2>
        <p className="text-muted-foreground mt-2 max-w-[640px] text-[14.5px] leading-[1.55]">{t('nextBody')}</p>
      </section>
    </main>
  );
}
