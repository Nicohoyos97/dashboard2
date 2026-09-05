-- 0021_business_dba.sql
-- Whether a business trades under a DBA, and which one.
--
-- `name` is what the portal calls the business and `legal_name` is the
-- registered entity. A DBA ("doing business as") is neither: it is the name the
-- business actually operates under, and the firm needs it on file because it is
-- what appears on filings and registrations.
--
-- The answer is recorded, not inferred from an empty field. "This client has no
-- DBA" and "nobody has asked yet" are different facts to a firm, and only one
-- of them means the file is complete — so `has_dba` is a column rather than
-- `dba_name is null`.
--
-- The pair is constrained rather than merely validated in the form: with a DBA
-- there must be a name, and without one there must not be a leftover name from
-- a previous answer. A stale trade name that the flag says is not in use is the
-- kind of thing that ends up on a filing.
alter table public.business_entities
  add column has_dba  boolean not null default false,
  add column dba_name text,
  add constraint business_entities_dba_pair check (
    (has_dba and btrim(coalesce(dba_name, '')) <> '') or (not has_dba and dba_name is null)
  );

comment on column public.business_entities.has_dba is
  'Whether the firm has recorded that this business trades under a DBA. Default false = no DBA on file.';
comment on column public.business_entities.dba_name is
  'The trade name, required when has_dba and forbidden otherwise (business_entities_dba_pair).';

-- ── firm-controlled, like industry and the logo ─────────────────────────────
-- What the firm records about a client, not a profile field the client edits:
-- the same reasoning as 0018, and the same trigger. Rewritten rather than
-- altered because a plpgsql body cannot be patched in place.
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
    or new.has_dba                 is distinct from old.has_dba
    or new.dba_name                is distinct from old.dba_name
  ) then
    raise exception 'firm-controlled column' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke execute on function public.guard_entity_firm_columns() from public, anon, authenticated, service_role;
