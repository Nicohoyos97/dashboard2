// Audit trail (INITIAL_PROMPT.md §8): audit_logs is firm-readable via
// is_firm_member(); rows carry identifiers and small metadata only.
import { getLocale, getTranslations } from 'next-intl/server';

import { card, inputClass, primaryButton, selectClass } from '@/components/admin/ui';
import { requireFirmMember } from '@/lib/auth/requireFirm';
import { createClient } from '@/lib/supabase/server';

const PAGE_SIZE = 100;

function hasMetadata(value: unknown): boolean {
  return typeof value === 'object' && value !== null && Object.keys(value).length > 0;
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ entity?: string; action?: string }>;
}) {
  const [, t, locale, params] = await Promise.all([
    requireFirmMember(),
    getTranslations('Admin'),
    getLocale(),
    searchParams,
  ]);
  const supabase = await createClient();

  let query = supabase
    .from('audit_logs')
    .select('id, actor_id, business_entity_id, action, resource_type, resource_id, metadata, ip, created_at')
    .order('created_at', { ascending: false })
    .limit(PAGE_SIZE);
  if (params.entity) query = query.eq('business_entity_id', params.entity);
  if (params.action) query = query.ilike('action', `${params.action.replace(/[%_]/g, '')}%`);

  const [{ data: rows }, { data: entities }] = await Promise.all([
    query,
    supabase.from('business_entities').select('id, name').order('name'),
  ]);

  const actorIds = [...new Set((rows ?? []).flatMap((r) => (r.actor_id ? [r.actor_id] : [])))];
  const { data: actors } = actorIds.length
    ? await supabase.from('profiles').select('id, full_name, email').in('id', actorIds)
    : { data: [] };
  const actorById = new Map((actors ?? []).map((a) => [a.id, a.full_name?.trim() || a.email || a.id]));
  const entityById = new Map((entities ?? []).map((e) => [e.id, e.name]));
  const fmt = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' });

  return (
    <main className="mx-auto w-full max-w-[1200px] px-6 py-10 md:px-10">
      <h1 className="text-ink text-[28px] font-bold tracking-[-0.01em]">{t('auditTitle')}</h1>
      <p className="text-muted-foreground mt-1.5 max-w-[640px] text-[15px]">{t('auditLede')}</p>

      <form method="get" className="mt-6 flex flex-wrap items-end gap-3">
        <div className="min-w-[220px]">
          <label htmlFor="entity" className="text-ink mb-1.5 block text-[13px] font-semibold">
            {t('filterEntity')}
          </label>
          <select id="entity" name="entity" defaultValue={params.entity ?? ''} className={selectClass}>
            <option value="">{t('allBusinesses')}</option>
            {(entities ?? []).map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-[220px]">
          <label htmlFor="action" className="text-ink mb-1.5 block text-[13px] font-semibold">
            {t('filterAction')}
          </label>
          <input id="action" name="action" defaultValue={params.action ?? ''} className={inputClass} />
        </div>
        <button type="submit" className={primaryButton}>
          {t('apply')}
        </button>
      </form>

      <section className={`${card} mt-4 overflow-x-auto p-0`}>
        {(rows ?? []).length === 0 ? (
          <p className="text-muted-foreground p-6 text-[14.5px]">{t('noAudit')}</p>
        ) : (
          <table className="w-full text-left text-[13.5px]">
            <thead className="text-muted-foreground border-line border-b text-[12px] font-semibold tracking-[0.06em] uppercase">
              <tr>
                <th className="px-4 py-3">{t('colWhen')}</th>
                <th className="px-4 py-3">{t('colActor')}</th>
                <th className="px-4 py-3">{t('colBusiness')}</th>
                <th className="px-4 py-3">{t('colAction')}</th>
                <th className="px-4 py-3">{t('colResource')}</th>
                <th className="px-4 py-3">{t('colIp')}</th>
              </tr>
            </thead>
            <tbody className="divide-line divide-y">
              {(rows ?? []).map((r) => (
                <tr key={r.id}>
                  <td className="text-muted-foreground px-4 py-2.5 whitespace-nowrap">
                    {fmt.format(new Date(r.created_at))}
                  </td>
                  <td className="text-ink px-4 py-2.5">
                    {r.actor_id ? (actorById.get(r.actor_id) ?? r.actor_id) : t('system')}
                  </td>
                  <td className="text-ink px-4 py-2.5">
                    {r.business_entity_id ? (entityById.get(r.business_entity_id) ?? '—') : '—'}
                  </td>
                  <td className="px-4 py-2.5">
                    <code className="bg-secondary text-ink rounded px-1.5 py-0.5 text-[12.5px]">{r.action}</code>
                  </td>
                  <td className="text-muted-foreground px-4 py-2.5">
                    {r.resource_type ? `${r.resource_type} · ${(r.resource_id ?? '').slice(0, 8)}` : '—'}
                    {hasMetadata(r.metadata) ? (
                      <span className="ml-2 text-[12px]">{JSON.stringify(r.metadata)}</span>
                    ) : null}
                  </td>
                  <td className="text-muted-foreground px-4 py-2.5">{typeof r.ip === 'string' ? r.ip : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
