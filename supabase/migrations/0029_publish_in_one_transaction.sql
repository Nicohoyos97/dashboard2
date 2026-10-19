-- 0029_publish_in_one_transaction.sql
-- Publishing and withdrawing a document are each one transaction.
--
-- lib/documents/publish.ts made a dozen separate PostgREST writes and read none
-- of their errors: supabase-js resolves with `{ error }` rather than throwing.
-- So a failure part-way left the two halves of a publication disagreeing — a
-- document stamped "Published" while the client had no figures for it (the
-- ledger's stamp hitting the one-published-ledger-per-month index after a
-- supersede that failed silently), or a withdrawn document whose figures stayed
-- in the client's portal (the very bug the five-table unpublish was written to
-- end). Here every write commits together or none does, and the action reports
-- the failure.
--
-- SECURITY INVOKER: these run as the firm admin who called them, so every
-- write goes through the same `is_firm_admin()` policies the separate writes
-- did (CLAUDE.md rule 3). The checks before publishing — reconciliation,
-- confidence, the ledger matching its P&L — stay in TypeScript
-- (publishBlockers), which also computes which ledger accounts the client may
-- read and passes them in.

create or replace function public.publish_document_version(
  p_document_id uuid,
  p_version_id uuid,
  p_visible_ledger_accounts uuid[] default '{}'
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_user uuid := auth.uid();
  v_current uuid;
  v_superseded integer;
  v_reports integer;
  v_title text;
  v_type text;
begin
  if not public.is_firm_admin() then
    raise exception 'publish_not_allowed' using errcode = '42501';
  end if;

  select current_version_id into v_current from public.documents where id = p_document_id for update;
  if not found then
    raise exception 'publish_document_missing' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.document_versions where id = p_version_id and document_id = p_document_id) then
    raise exception 'publish_version_mismatch' using errcode = 'P0002';
  end if;

  -- Older published reports covering the same statement.
  update public.financial_reports prev
     set status = 'superseded', published_at = null, superseded_by = cur.id
    from public.financial_reports cur
   where cur.document_version_id = p_version_id
     and prev.business_entity_id = cur.business_entity_id
     and prev.report_type = cur.report_type
     and prev.period_start = cur.period_start
     and prev.period_end = cur.period_end
     and prev.status = 'published'
     and prev.id <> cur.id;
  get diagnostics v_superseded = row_count;

  -- A ledger: only the accounts behind a P&L line become readable (0026), and
  -- it replaces the month's previous one before the stamp, because the
  -- published-period index allows one per month.
  update public.ledger_accounts a
     set client_visible = (a.id = any(p_visible_ledger_accounts))
    from public.general_ledgers g
   where g.document_version_id = p_version_id
     and a.ledger_id = g.id;
  update public.general_ledgers prev
     set status = 'superseded', published_at = null, published_by = null, superseded_by = cur.id
    from public.general_ledgers cur
   where cur.document_version_id = p_version_id
     and prev.business_entity_id = cur.business_entity_id
     and prev.period_start = cur.period_start
     and prev.period_end = cur.period_end
     and prev.status = 'published'
     and prev.id <> cur.id;

  update public.general_ledgers
     set status = 'published', published_at = v_now, published_by = v_user
   where document_version_id = p_version_id;
  update public.financial_reports
     set status = 'published', published_at = v_now, published_by = v_user
   where document_version_id = p_version_id;
  get diagnostics v_reports = row_count;
  update public.bank_statements
     set status = 'published', published_at = v_now, published_by = v_user
   where document_version_id = p_version_id;
  update public.sales_reports
     set status = 'published', published_at = v_now, published_by = v_user
   where document_version_id = p_version_id;
  -- These three carry publication in `published_at` alone — no status column.
  update public.tax_obligations
     set published_at = v_now, published_by = v_user
   where document_version_id = p_version_id;
  update public.tax_payments
     set published_at = v_now, published_by = v_user
   where document_version_id = p_version_id;
  update public.payroll_obligations
     set published_at = v_now, published_by = v_user
   where document_version_id = p_version_id;

  -- A replaced version: the previous current version is marked superseded.
  if v_current is not null and v_current <> p_version_id then
    update public.document_versions set superseded_at = v_now where id = v_current;
  end if;

  update public.documents
     set status = 'published', published_at = v_now, published_by = v_user, current_version_id = p_version_id
   where id = p_document_id
  returning title, document_type into v_title, v_type;
  if not found then
    raise exception 'publish_document_missing' using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'title', v_title,
    'document_type', v_type,
    'reports', v_reports,
    'superseded', v_superseded,
    'replaced_version', v_current is not null and v_current <> p_version_id
  );
end;
$$;

revoke execute on function public.publish_document_version(uuid, uuid, uuid[]) from public, anon;
grant  execute on function public.publish_document_version(uuid, uuid, uuid[]) to authenticated;

-- Withdraw everything publishing stamped, across every version of the
-- document: publication stamps the review version, which is not always the one
-- `current_version_id` names. Null when the document is not published.
create or replace function public.unpublish_document(p_document_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_status text;
  v_title text;
begin
  if not public.is_firm_admin() then
    raise exception 'publish_not_allowed' using errcode = '42501';
  end if;

  select status into v_status from public.documents where id = p_document_id for update;
  if not found or v_status <> 'published' then
    return null;
  end if;

  update public.financial_reports
     set status = 'reconciled', published_at = null, published_by = null
   where status = 'published'
     and document_version_id in (select id from public.document_versions where document_id = p_document_id);
  update public.bank_statements
     set status = 'reconciled', published_at = null, published_by = null
   where status = 'published'
     and document_version_id in (select id from public.document_versions where document_id = p_document_id);
  update public.sales_reports
     set status = 'reconciled', published_at = null, published_by = null
   where status = 'published'
     and document_version_id in (select id from public.document_versions where document_id = p_document_id);
  update public.general_ledgers
     set status = 'reconciled', published_at = null, published_by = null
   where status = 'published'
     and document_version_id in (select id from public.document_versions where document_id = p_document_id);
  update public.tax_obligations
     set published_at = null, published_by = null
   where document_version_id in (select id from public.document_versions where document_id = p_document_id);
  update public.tax_payments
     set published_at = null, published_by = null
   where document_version_id in (select id from public.document_versions where document_id = p_document_id);
  update public.payroll_obligations
     set published_at = null, published_by = null
   where document_version_id in (select id from public.document_versions where document_id = p_document_id);

  update public.documents
     set status = 'reconciled', published_at = null, published_by = null
   where id = p_document_id
  returning title into v_title;

  return jsonb_build_object('title', v_title);
end;
$$;

revoke execute on function public.unpublish_document(uuid) from public, anon;
grant  execute on function public.unpublish_document(uuid) to authenticated;
