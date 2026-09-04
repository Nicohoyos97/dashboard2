// Firm queue for client account requests (INITIAL_PROMPT.md §7: data export and
// account deletion, "queued for firm confirmation"). Open requests come first,
// oldest at the top, because this queue carries a response-time obligation:
// nothing else in the portal is waiting on the firm the way a client is here.
import { getLocale, getTranslations } from 'next-intl/server';

import { RequestActions } from '@/components/admin/RequestActions';
import { card, statusPill } from '@/components/admin/ui';
import { Link } from '@/i18n/navigation';
import { requireFirmMember } from '@/lib/auth/requireFirm';
import { createClient } from '@/lib/supabase/server';

/** An open request older than this is called out. The firm answers, the portal never acts on its own. */
const SLA_DAYS = 7;

const OPEN = ['pending', 'in_progress'];

export default async function AccountRequestsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const [firm, t, locale, params] = await Promise.all([
    requireFirmMember(),
    getTranslations('Admin'),
    getLocale(),
    searchParams,
  ]);
  const showAll = params.status === 'all';
  const supabase = await createClient();

  const query = supabase
    .from('account_requests')
    .select('id, kind, status, message, firm_note, requested_at, resolved_at, user_id, business_entity_id, business_entities ( name )')
    .order('requested_at', { ascending: !showAll })
    .limit(100);
  const { data: requests } = await (showAll ? query : query.in('status', OPEN));

  const userIds = [...new Set((requests ?? []).map((row) => row.user_id))];
  const { data: profiles } = userIds.length
    ? await supabase.from('profiles').select('id, full_name, email').in('id', userIds)
    : { data: [] };
  const profileOf = new Map((profiles ?? []).map((profile) => [profile.id, profile]));

  const fmt = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' });
  const canEdit = firm.role === 'master_admin';
  const now = Date.now();
  const ageInDays = (iso: string) => Math.floor((now - new Date(iso).getTime()) / 86_400_000);

  return (
    <main className="mx-auto w-full max-w-[1000px] px-6 py-10 md:px-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-ink text-[28px] font-bold tracking-[-0.01em]">{t('requestsTitle')}</h1>
          <p className="text-muted-foreground mt-1.5 max-w-[640px] text-[15px]">{t('requestsLede')}</p>
        </div>
        <nav aria-label={t('statusLabel')} className="border-line bg-secondary inline-flex rounded-xl border p-0.5 text-[13px] font-medium">
          <FilterLink href="/admin/requests" label={t('requestsFilterOpen')} active={!showAll} />
          <FilterLink href="/admin/requests?status=all" label={t('requestsFilterAll')} active={showAll} />
        </nav>
      </div>

      {(requests ?? []).length === 0 ? (
        <p className="text-muted-foreground mt-8 text-[14.5px]">{showAll ? t('requestsEmptyAll') : t('requestsEmptyOpen')}</p>
      ) : (
        <ul className="mt-6 flex flex-col gap-4">
          {(requests ?? []).map((request) => {
            const profile = profileOf.get(request.user_id);
            const open = OPEN.includes(request.status);
            const days = ageInDays(request.requested_at);
            return (
              <li key={request.id} className={card}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-ink flex flex-wrap items-center gap-2.5 text-[16px] font-semibold">
                      {t(`requestKind_${request.kind}`)}
                      <span className={statusPill(request.status === 'completed' ? 'published' : request.status)}>{t(`requestStatus_${request.status}`)}</span>
                    </h2>
                    <p className="text-muted-foreground mt-1 text-[13.5px]">
                      <Link href={`/admin/entities/${request.business_entity_id}`} className="hover:text-blue font-medium">
                        {request.business_entities?.name ?? '—'}
                      </Link>
                      {' · '}
                      {profile?.full_name || profile?.email || t('requestUnknownUser')}
                      {' · '}
                      {fmt.format(new Date(request.requested_at))}
                    </p>
                  </div>
                  {open && (
                    <span className={`shrink-0 text-[12.5px] font-semibold ${days >= SLA_DAYS ? 'text-danger' : 'text-muted-foreground'}`}>
                      {t('requestAge', { days })}
                    </span>
                  )}
                </div>

                {request.message && (
                  <p className="border-line text-foreground mt-3 border-l-2 pl-3 text-[14px] leading-[1.5] whitespace-pre-wrap">{request.message}</p>
                )}

                {open ? (
                  <RequestActions id={request.id} status={request.status} firmNote={request.firm_note} canEdit={canEdit} />
                ) : (
                  <p className="text-muted-foreground mt-3 text-[13.5px]">
                    {request.firm_note ? `${t('requestNoteLabel')}: ${request.firm_note}` : t('requestNoNote')}
                    {request.resolved_at ? ` · ${fmt.format(new Date(request.resolved_at))}` : ''}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}

function FilterLink({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`rounded-[10px] px-3 py-1.5 ${active ? 'bg-card text-ink shadow-[0_1px_2px_rgba(15,23,42,0.06)]' : 'text-muted-foreground hover:text-ink'}`}
    >
      {label}
    </Link>
  );
}
