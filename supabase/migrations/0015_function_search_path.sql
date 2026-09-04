-- 0015_function_search_path.sql
-- Pin search_path on the three functions that were still missing it, flagged by
-- Supabase's `function_search_path_mutable` linter on the cloud project.
--
-- Every other function in the schema already pins it (0001 §function hardening
-- onwards); these three were added later and skipped it. An unpinned search_path
-- lets whatever schema list the caller carries decide how an unqualified name
-- resolves — the reason the rest of the schema pins it, and object_entity_id
-- matters most: it is called from the `exports` storage policy, so its
-- resolution happens under whatever session opens a signed URL.
--
-- Bodies are unchanged from 0005 / 0010 / 0013 — every reference inside them is
-- already schema-qualified (storage.foldername, public.is_firm_admin, auth.*)
-- or lives in pg_catalog, so pinning changes nothing about what they do.
--
-- The two trigger functions also lose EXECUTE, matching how 0001 and 0002 treat
-- set_updated_at / handle_new_user / guard_entity_firm_columns: a trigger runs
-- them through the trigger mechanism, so no role needs the privilege.

-- ── object_entity_id (0005) ──────────────────────────────────────────────────
-- First path segment as a uuid, or null for anything malformed (never raises).
create or replace function public.object_entity_id(object_name text)
returns uuid
language plpgsql
immutable
set search_path = public
as $$
declare
  parts text[];
begin
  parts := storage.foldername(object_name);
  if parts is null or array_length(parts, 1) < 1 or parts[1] !~ '^[0-9a-fA-F-]{36}$' then
    return null;
  end if;
  return parts[1]::uuid;
exception when others then
  return null;
end;
$$;

revoke execute on function public.object_entity_id(text) from public, anon, authenticated, service_role;
grant  execute on function public.object_entity_id(text) to authenticated, service_role;

-- ── assert_valid_timezone (0010) ─────────────────────────────────────────────
create or replace function public.assert_valid_timezone()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  probe timestamp;
begin
  if new.timezone is null or btrim(new.timezone) = '' then
    raise exception 'business_entities.timezone must be an IANA time zone name';
  end if;
  probe := now() at time zone new.timezone;  -- raises on an unknown zone
  return new;
end;
$$;

revoke execute on function public.assert_valid_timezone() from public, anon, authenticated, service_role;

-- ── account_requests_guard (0013) ────────────────────────────────────────────
create or replace function public.account_requests_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  is_client boolean := auth.role() = 'authenticated' and not public.is_firm_admin();
  is_firm   boolean := auth.role() = 'authenticated' and public.is_firm_admin();
  terminal  constant text[] := array['completed', 'declined', 'cancelled'];
begin
  if tg_op = 'INSERT' then
    if is_client then
      if new.firm_note is not null or new.resolved_at is not null or new.resolved_by is not null then
        raise exception 'account_requests: a client may only raise a request';
      end if;
      new.requested_at := now();
    end if;
    return new;
  end if;

  if is_client then
    if new.id                 is distinct from old.id
    or new.business_entity_id is distinct from old.business_entity_id
    or new.user_id            is distinct from old.user_id
    or new.kind               is distinct from old.kind
    or new.message            is distinct from old.message
    or new.firm_note          is distinct from old.firm_note
    or new.requested_at       is distinct from old.requested_at
    or new.resolved_at        is distinct from old.resolved_at
    or new.resolved_by        is distinct from old.resolved_by
    then
      raise exception 'account_requests: a client may only withdraw a request';
    end if;
    if new.status = 'cancelled' and old.status <> 'cancelled' then
      new.resolved_at := now();
    end if;
    return new;
  end if;

  if is_firm then
    if new.id                 is distinct from old.id
    or new.business_entity_id is distinct from old.business_entity_id
    or new.user_id            is distinct from old.user_id
    or new.kind               is distinct from old.kind
    or new.message            is distinct from old.message
    or new.requested_at       is distinct from old.requested_at
    then
      raise exception 'account_requests: the firm may only answer a request';
    end if;
    if old.status = any (terminal) and new.status is distinct from old.status then
      raise exception 'account_requests: a resolved request is not reopened';
    end if;
    if new.status = any (terminal) and old.status <> new.status then
      new.resolved_at := coalesce(new.resolved_at, now());
      new.resolved_by := coalesce(new.resolved_by, auth.uid());
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function public.account_requests_guard() from public, anon, authenticated, service_role;
