-- 0018_entity_branding_and_modules.sql
-- What the firm sets up when it provisions a business: who the client is, and
-- which parts of the portal they bought.
--
-- 1. industry / logo_url — shown in the client's own portal chrome and on the
--    firm's client list. Firm-controlled, so guard_entity_firm_columns (0002)
--    is extended to cover them: a client_owner edits name, legal name and
--    address, never what the firm sold them.
--
-- 2. enabled_modules gains `statements`. Until now the column carried
--    {expenses, income_taxes} and *nothing in the client portal read it* —
--    only sales_tax_enabled gated anything, so the two switches the firm could
--    see in /admin did nothing at all. A sales-tax-only client has to be able
--    to not see Profit & Loss and Balance Sheet, which needs a third key.
--    Existing rows are backfilled to true so no live client loses a page.
alter table public.business_entities
  add column industry text,
  add column logo_url text;

comment on column public.business_entities.industry is
  'Free text as the firm records it — a fixed list would not survive a real client roster.';
comment on column public.business_entities.logo_url is
  'Public URL of an object in the `logos` bucket. Firm-set; the client cannot change it.';

update public.business_entities
   set enabled_modules = enabled_modules || '{"statements": true}'::jsonb
 where not (enabled_modules ? 'statements');

alter table public.business_entities
  alter column enabled_modules
  set default '{"statements": true, "expenses": true, "income_taxes": true}'::jsonb;

-- ── the firm owns branding too ───────────────────────────────────────────────
-- Same guard as the other firm-controlled columns: the trigger raises 42501
-- when a client tries to change one. Rewritten rather than altered because a
-- plpgsql body cannot be patched in place.
create or replace function public.guard_entity_firm_columns()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if auth.role() = 'authenticated' and not public.is_firm_admin() and (
       new.client_id               is distinct from old.client_id
    or new.fiscal_year_start_month is distinct from old.fiscal_year_start_month
    or new.accounting_basis        is distinct from old.accounting_basis
    or new.currency                is distinct from old.currency
    or new.sales_tax_enabled       is distinct from old.sales_tax_enabled
    or new.enabled_modules         is distinct from old.enabled_modules
    or new.status                  is distinct from old.status
    or new.created_by              is distinct from old.created_by
    or new.industry                is distinct from old.industry
    or new.logo_url                is distinct from old.logo_url
  ) then
    raise exception 'firm-controlled column' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke execute on function public.guard_entity_firm_columns() from public, anon, authenticated, service_role;

-- ── logos bucket ─────────────────────────────────────────────────────────────
-- Public-read, like `avatars` and for the same reason: it is rendered in the
-- portal chrome on every page, and a signed URL would have to be refreshed on
-- each render. A business logo is the client's own public branding. Writes are
-- firm-admin only — unlike avatars, the subject does not own this object.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('logos', 'logos', true, 2097152, array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "logos_public_read" on storage.objects
  for select using (bucket_id = 'logos');

create policy "logos_admin_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'logos' and public.is_firm_admin());

create policy "logos_admin_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'logos' and public.is_firm_admin());

create policy "logos_admin_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'logos' and public.is_firm_admin());
