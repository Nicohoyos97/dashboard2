-- 0003_documents.sql — Documents, versions, page classification, the
-- processing queue and the private `documents` bucket (INITIAL_PROMPT.md §8–§9).
--
--   documents            what the client sees (type, title, period, status)
--   document_versions    immutable bytes; a replacement is a new version
--   document_pages       per-page classification written by the worker
--   document_processing_jobs  DB-backed queue claimed by the worker
--   bucket documents     private; documents/{entity}/{document}/v{n}/{filename}
--
-- Archetypes (skill writing-rls-policies): documents / versions are B (firm
-- writes, members read published rows); pages and jobs are A (service role
-- writes; firm reads; firm admin may re-queue a job).

-- ── documents ────────────────────────────────────────────────────────────────
create table public.documents (
  id                 uuid primary key default gen_random_uuid(),
  business_entity_id uuid not null references public.business_entities (id) on delete cascade,
  document_type      text not null check (document_type in (
                       'bank_statement', 'profit_and_loss', 'balance_sheet',
                       'statement_package', 'sales_tax_filing', 'sales_tax_payment',
                       'income_tax_document', 'payroll_summary', 'csv_transactions',
                       'other_report')),
  title              text not null,          -- client-visible
  period_start       date,
  period_end         date,
  status             text not null default 'uploaded' check (status in (
                       'uploaded', 'processing', 'needs_review', 'reconciled',
                       'ready_to_publish', 'published', 'failed', 'superseded')),
  current_version_id uuid,                   -- FK added below (circular)
  published_at       timestamptz,
  published_by       uuid references auth.users (id) on delete set null,
  created_by         uuid references auth.users (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  check ((status = 'published') = (published_at is not null))
);

create index documents_entity_idx on public.documents (business_entity_id, period_end desc, created_at desc);
create index documents_status_idx on public.documents (status, updated_at desc);

create trigger documents_set_updated_at
  before update on public.documents
  for each row execute function public.set_updated_at();

-- ── document_versions ────────────────────────────────────────────────────────
create table public.document_versions (
  id                    uuid primary key default gen_random_uuid(),
  document_id           uuid not null references public.documents (id) on delete cascade,
  business_entity_id    uuid not null references public.business_entities (id) on delete cascade,
  version_no            integer not null check (version_no >= 1),
  storage_path          text not null unique,
  original_filename     text not null,
  mime_type             text not null,
  size_bytes            bigint not null check (size_bytes >= 0),
  sha256                text,                -- set by finalize; null while uploading
  page_count            integer check (page_count >= 0),
  upload_status         text not null default 'uploading'
                          check (upload_status in ('uploading', 'uploaded', 'rejected')),
  reject_code           text,                -- code only, never content
  supersedes_version_id uuid references public.document_versions (id) on delete set null,
  superseded_at         timestamptz,
  uploaded_by           uuid references auth.users (id) on delete set null,
  created_at            timestamptz not null default now(),
  unique (document_id, version_no)
);

-- Duplicate detection by checksum within a business (spec §9).
create unique index document_versions_entity_sha_idx
  on public.document_versions (business_entity_id, sha256)
  where sha256 is not null and upload_status = 'uploaded';

create index document_versions_document_idx on public.document_versions (document_id, version_no desc);
create index document_versions_entity_idx   on public.document_versions (business_entity_id, created_at desc);

alter table public.documents
  add constraint documents_current_version_fk
  foreign key (current_version_id) references public.document_versions (id) on delete set null;

-- ── document_pages ───────────────────────────────────────────────────────────
create table public.document_pages (
  id                  uuid primary key default gen_random_uuid(),
  document_version_id uuid not null references public.document_versions (id) on delete cascade,
  business_entity_id  uuid not null references public.business_entities (id) on delete cascade,
  page_number         integer not null check (page_number >= 1),
  kind                text check (kind in ('firm_letter', 'financial_statement', 'notes', 'other')),
  report_type         text check (report_type in (
                        'profit_and_loss', 'balance_sheet', 'bank_statement',
                        'sales_tax', 'income_tax', 'payroll', 'other')),
  period_start        date,
  period_end          date,
  confidence          numeric(4,3) check (confidence between 0 and 1),
  classified_at       timestamptz,
  unique (document_version_id, page_number)
);

create index document_pages_entity_idx on public.document_pages (business_entity_id, document_version_id);

-- ── document_processing_jobs ─────────────────────────────────────────────────
create table public.document_processing_jobs (
  id                  uuid primary key default gen_random_uuid(),
  business_entity_id  uuid not null references public.business_entities (id) on delete cascade,
  document_version_id uuid not null references public.document_versions (id) on delete cascade,
  status              text not null default 'pending'
                        check (status in ('pending', 'running', 'succeeded', 'failed')),
  step                text not null default 'split'
                        check (step in ('split', 'classify', 'extract', 'reconcile', 'done')),
  attempts            integer not null default 0,
  max_attempts        integer not null default 3,
  error_code          text,                  -- code only, never document content
  locked_at           timestamptz,
  run_after           timestamptz not null default now(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  finished_at         timestamptz
);

create index jobs_queue_idx   on public.document_processing_jobs (status, run_after) where status = 'pending';
create index jobs_entity_idx  on public.document_processing_jobs (business_entity_id, created_at desc);
create index jobs_version_idx on public.document_processing_jobs (document_version_id);

create trigger jobs_set_updated_at
  before update on public.document_processing_jobs
  for each row execute function public.set_updated_at();

-- Claim up to `batch_size` runnable jobs for this worker invocation. Stale
-- `running` rows (a worker that timed out) are re-queued first. FOR UPDATE SKIP
-- LOCKED makes concurrent cron ticks safe. service_role only.
create or replace function public.claim_processing_jobs(batch_size integer default 1)
returns setof public.document_processing_jobs
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.document_processing_jobs
     set status = 'pending', locked_at = null
   where status = 'running' and locked_at < now() - interval '10 minutes';

  return query
    with picked as (
      select id
        from public.document_processing_jobs
       where status = 'pending' and run_after <= now() and attempts < max_attempts
       order by created_at
       for update skip locked
       limit greatest(batch_size, 1)
    )
    update public.document_processing_jobs j
       set status = 'running', locked_at = now(), attempts = j.attempts + 1
      from picked
     where j.id = picked.id
    returning j.*;
end;
$$;

revoke execute on function public.claim_processing_jobs(integer) from public, anon, authenticated, service_role;
grant  execute on function public.claim_processing_jobs(integer) to service_role;

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.documents                enable row level security;
alter table public.document_versions        enable row level security;
alter table public.document_pages           enable row level security;
alter table public.document_processing_jobs enable row level security;

-- documents — members see PUBLISHED rows only; the firm sees everything.
create policy "documents_member_select" on public.documents
  for select using (
    (public.is_entity_member(business_entity_id) and status = 'published')
    or public.is_firm_member()
  );

create policy "documents_admin_insert" on public.documents
  for insert with check (public.is_firm_admin());

create policy "documents_admin_update" on public.documents
  for update using (public.is_firm_admin()) with check (public.is_firm_admin());
-- No DELETE: unpublish / supersede keep history.

-- document_versions — members see only the current version of a published
-- document (the exact bytes they may download). Firm sees every version.
create policy "versions_member_select" on public.document_versions
  for select using (
    (public.is_entity_member(business_entity_id)
      and exists (
        select 1 from public.documents d
         where d.id = document_id
           and d.status = 'published'
           and d.current_version_id = public.document_versions.id))
    or public.is_firm_member()
  );

create policy "versions_admin_insert" on public.document_versions
  for insert with check (public.is_firm_admin());

-- finalize sets sha256 / page_count / upload_status; supersede sets superseded_at.
create policy "versions_admin_update" on public.document_versions
  for update using (public.is_firm_admin()) with check (public.is_firm_admin());

-- document_pages — firm read only (clients see type + period on the document).
create policy "pages_firm_select" on public.document_pages
  for select using (public.is_firm_member());

-- jobs — firm read; firm admin may re-queue (retry). Worker writes via service role.
create policy "jobs_firm_select" on public.document_processing_jobs
  for select using (public.is_firm_member());

create policy "jobs_admin_insert" on public.document_processing_jobs
  for insert with check (public.is_firm_admin());

create policy "jobs_admin_update" on public.document_processing_jobs
  for update using (public.is_firm_admin()) with check (public.is_firm_admin());

-- ── storage: bucket `documents` (private) ────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documents',
  'documents',
  false,
  52428800, -- 50 MB (matches storage.file_size_limit in config.toml)
  array['application/pdf', 'text/csv', 'text/plain']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Is this object the current version of a published document the caller may
-- see? Parses documents/{entity}/{document}/v{n}/{filename}. Any malformed path
-- is simply not visible (never an error that could break unrelated buckets).
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
          and v.business_entity_id = entity
          and v.version_no = ver
     );
exception when others then
  return false;
end;
$$;

revoke execute on function public.document_object_is_client_visible(text) from public, anon, authenticated, service_role;
grant  execute on function public.document_object_is_client_visible(text) to authenticated, service_role;

-- Reads reach clients only through the download route handler (signed URL
-- ≤ 60 s); this policy is what lets that handler sign with the user's session.
create policy "documents_member_read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'documents'
    and (public.is_firm_member() or public.document_object_is_client_visible(name))
  );

create policy "documents_admin_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'documents' and public.is_firm_admin());

-- No UPDATE / DELETE policies on documents objects: bytes are immutable and
-- history is never deleted. A replacement is a new version at a new path.
