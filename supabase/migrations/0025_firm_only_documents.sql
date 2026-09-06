-- 0025_firm_only_documents.sql
-- A point-of-sale report is the firm's working paper, not a client deliverable.
--
-- 0022 gave sales reports their own document type so the register and the state
-- filing would stop feeding the same figures. Publishing one is still what
-- makes the register numbers visible — net sales, tips, tax collected, the
-- tender lines on the Sales Taxes page and the Overview — but the *file* is the
-- client's own Clover/Toast/Square export sent to us, and handing it back to
-- them under "Available reports & documents" is not something the firm
-- publishes. So the figures stay and the document row goes.
--
-- Stated once, in `document_type_is_client_visible`, and read by all three
-- places a client can reach a document: the row, its bytes, and the storage
-- object behind the download. A rule in only two of the three is a rule that
-- hides a tile and still serves the PDF to anyone who guesses a version id.

create or replace function public.document_type_is_client_visible(doc_type text)
returns boolean
language sql
immutable
as $$
  select doc_type <> 'sales_report';
$$;

revoke execute on function public.document_type_is_client_visible(text) from public, anon;
grant  execute on function public.document_type_is_client_visible(text) to authenticated, service_role;

-- ── the document row ─────────────────────────────────────────────────────────
drop policy "documents_member_select" on public.documents;
create policy "documents_member_select" on public.documents
  for select using (
    (public.is_entity_member(business_entity_id)
      and status = 'published'
      and public.document_type_is_client_visible(document_type))
    or public.is_firm_member()
  );

-- ── its bytes ────────────────────────────────────────────────────────────────
drop policy "versions_member_select" on public.document_versions;
create policy "versions_member_select" on public.document_versions
  for select using (
    (public.is_entity_member(business_entity_id)
      and exists (
        select 1 from public.documents d
         where d.id = document_id
           and d.status = 'published'
           and d.current_version_id = public.document_versions.id
           and public.document_type_is_client_visible(d.document_type)))
    or public.is_firm_member()
  );

-- ── the storage object the download route signs ──────────────────────────────
create or replace function public.document_object_is_client_visible(object_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  parts  text[];
  entity uuid;
  doc    uuid;
  ver    integer;
begin
  parts := storage.foldername(object_name);
  if parts is null or array_length(parts, 1) < 3 then
    return false;
  end if;
  if parts[1] !~ '^[0-9a-fA-F-]{36}$'
     or parts[2] !~ '^[0-9a-fA-F-]{36}$'
     or parts[3] !~ '^v[0-9]+$' then
    return false;
  end if;
  entity := parts[1]::uuid;
  doc    := parts[2]::uuid;
  ver    := substring(parts[3] from 2)::integer;

  return public.is_entity_member(entity)
     and exists (
       select 1
         from public.documents d
         join public.document_versions v on v.id = d.current_version_id
        where d.id = doc
          and d.business_entity_id = entity
          and d.status = 'published'
          and public.document_type_is_client_visible(d.document_type)
          and v.business_entity_id = entity
          and v.version_no = ver
     );
exception when others then
  return false;
end;
$$;
