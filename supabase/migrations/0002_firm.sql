-- 0002_firm.sql — Firm side of the tenancy model (INITIAL_PROMPT.md §5, §8).
--
--   firms, firm_memberships (master_admin | firm_staff), clients,
--   business_entities configuration columns, entity_firm_notes,
--   is_firm_member() / is_firm_admin() (both require aal2),
--   firm read on every tenant table that already exists, firm-admin writes on
--   configuration tables, and a trigger that keeps client_owner from touching
--   firm-controlled columns on business_entities.
--
-- Roles (docs/PLAN.md §4):
--   is_firm_member()  any firm role + aal2   → every firm SELECT
--   is_firm_admin()   master_admin + aal2    → every firm write
-- firm_staff is scaffolded read-only; no UI beyond read-only dashboards.

-- ── firms ────────────────────────────────────────────────────────────────────
create table public.firms (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_at timestamptz not null default now()
);

-- ── firm_memberships ─────────────────────────────────────────────────────────
-- The first master_admin is created by the seed / a one-off SQL statement,
-- never through the app.
create table public.firm_memberships (
  firm_id    uuid not null references public.firms (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  role       text not null check (role in ('master_admin', 'firm_staff')),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (firm_id, user_id)
);

create index firm_memberships_user_idx on public.firm_memberships (user_id);

-- ── clients ──────────────────────────────────────────────────────────────────
-- A firm client (a person or company the firm does the books for). A client
-- owns one or more business_entities. Firm-only table: clients never read it.
create table public.clients (
  id            uuid primary key default gen_random_uuid(),
  firm_id       uuid not null references public.firms (id) on delete restrict,
  name          text not null,
  contact_name  text,
  contact_email text,
  notes         text,   -- firm-internal
  status        text not null default 'active' check (status in ('active', 'archived')),
  created_by    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index clients_firm_idx on public.clients (firm_id, name);

create trigger clients_set_updated_at
  before update on public.clients
  for each row execute function public.set_updated_at();

-- ── business_entities: §5 configuration columns ──────────────────────────────
-- firm_notes deliberately does NOT live here: RLS is row-level, so any column
-- on this table is readable by the client. Firm-internal notes go to
-- entity_firm_notes (firm-only policies) instead.
alter table public.business_entities
  add column client_id               uuid not null references public.clients (id) on delete restrict,
  add column fiscal_year_start_month smallint not null default 1
    check (fiscal_year_start_month between 1 and 12),
  add column accounting_basis        text not null default 'cash'
    check (accounting_basis in ('cash', 'accrual')),
  add column currency                char(3) not null default 'USD',
  add column sales_tax_enabled       boolean not null default false,
  add column enabled_modules         jsonb not null default '{"expenses": true, "income_taxes": true}'::jsonb,
  add column status                  text not null default 'active'
    check (status in ('active', 'archived'));

create index business_entities_client_idx on public.business_entities (client_id);

create table public.entity_firm_notes (
  business_entity_id uuid primary key references public.business_entities (id) on delete cascade,
  notes              text not null default '',
  updated_by         uuid references auth.users (id) on delete set null,
  updated_at         timestamptz not null default now()
);

create trigger entity_firm_notes_set_updated_at
  before update on public.entity_firm_notes
  for each row execute function public.set_updated_at();

-- ── firm helpers ─────────────────────────────────────────────────────────────
-- Both require a second factor: Supabase puts the assurance level in the JWT
-- (`aal` = 'aal1' | 'aal2'). A firm admin who has not completed TOTP is, for
-- RLS purposes, not a firm admin at all. security definer + pinned search_path
-- like the baseline helpers.
create or replace function public.is_firm_member()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select (auth.jwt() ->> 'aal') = 'aal2'
     and exists (
       select 1 from public.firm_memberships where user_id = auth.uid()
     );
$$;

create or replace function public.is_firm_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select (auth.jwt() ->> 'aal') = 'aal2'
     and exists (
       select 1 from public.firm_memberships
       where user_id = auth.uid() and role = 'master_admin'
     );
$$;

revoke execute on function public.is_firm_member() from public, anon, authenticated, service_role;
grant  execute on function public.is_firm_member() to authenticated, service_role;

revoke execute on function public.is_firm_admin() from public, anon, authenticated, service_role;
grant  execute on function public.is_firm_admin() to authenticated, service_role;

-- ── guard: firm-controlled columns on business_entities ──────────────────────
-- entities_owner_update lets a client_owner UPDATE the row (profile fields).
-- Row-level policies cannot restrict columns, so this trigger rejects any
-- change to firm-controlled columns unless the caller is a firm admin. Only the
-- `authenticated` role is constrained: service_role (jobs) and postgres
-- (migrations, seed) are not. The role comes from the JWT claim (auth.role()),
-- never from current_user: inside a security-definer function current_user is
-- the owner, which is exactly the trap that would silently disable this guard.
-- SECURITY INVOKER on purpose; is_firm_admin() is the definer helper.
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
  ) then
    raise exception 'firm-controlled column' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke execute on function public.guard_entity_firm_columns() from public, anon, authenticated, service_role;

create trigger business_entities_guard_firm_columns
  before update on public.business_entities
  for each row execute function public.guard_entity_firm_columns();

-- ── RLS: new tables ──────────────────────────────────────────────────────────
alter table public.firms             enable row level security;
alter table public.firm_memberships  enable row level security;
alter table public.clients           enable row level security;
alter table public.entity_firm_notes enable row level security;

create policy "firms_firm_select" on public.firms
  for select using (public.is_firm_member());

create policy "firms_admin_update" on public.firms
  for update using (public.is_firm_admin()) with check (public.is_firm_admin());

-- A user may read their own firm membership at aal1 (the /admin layout needs
-- it to decide whether to ask for TOTP); everything else requires aal2.
create policy "firm_memberships_self_select" on public.firm_memberships
  for select using (user_id = auth.uid());

create policy "firm_memberships_firm_select" on public.firm_memberships
  for select using (public.is_firm_member());

create policy "firm_memberships_admin_insert" on public.firm_memberships
  for insert with check (public.is_firm_admin());

create policy "firm_memberships_admin_update" on public.firm_memberships
  for update using (public.is_firm_admin()) with check (public.is_firm_admin());

create policy "firm_memberships_admin_delete" on public.firm_memberships
  for delete using (public.is_firm_admin() and user_id <> auth.uid());

create policy "clients_firm_select" on public.clients
  for select using (public.is_firm_member());

create policy "clients_admin_insert" on public.clients
  for insert with check (public.is_firm_admin());

create policy "clients_admin_update" on public.clients
  for update using (public.is_firm_admin()) with check (public.is_firm_admin());
-- No DELETE: clients are archived (status), never removed.

create policy "entity_firm_notes_firm_select" on public.entity_firm_notes
  for select using (public.is_firm_member());

create policy "entity_firm_notes_admin_insert" on public.entity_firm_notes
  for insert with check (public.is_firm_admin());

create policy "entity_firm_notes_admin_update" on public.entity_firm_notes
  for update using (public.is_firm_admin()) with check (public.is_firm_admin());

-- ── RLS: firm path on baseline tables ────────────────────────────────────────
drop policy "entities_member_select" on public.business_entities;
create policy "entities_member_select" on public.business_entities
  for select using (public.is_entity_member(id) or public.is_firm_member());

create policy "entities_admin_insert" on public.business_entities
  for insert with check (public.is_firm_admin());

create policy "entities_admin_update" on public.business_entities
  for update using (public.is_firm_admin()) with check (public.is_firm_admin());
-- Still no DELETE for anyone: businesses are archived (status).

drop policy "memberships_member_select" on public.entity_memberships;
create policy "memberships_member_select" on public.entity_memberships
  for select using (public.is_entity_member(business_entity_id) or public.is_firm_member());

create policy "memberships_admin_insert" on public.entity_memberships
  for insert with check (public.is_firm_admin());

create policy "memberships_admin_update" on public.entity_memberships
  for update using (public.is_firm_admin()) with check (public.is_firm_admin());

create policy "memberships_admin_delete" on public.entity_memberships
  for delete using (public.is_firm_admin());

-- Firm reads every profile (client directory, linking an existing account by
-- email). Profiles stay self-update only.
create policy "profiles_firm_select" on public.profiles
  for select using (public.is_firm_member());

-- audit_logs: the firm-admin read that the baseline deferred to Phase 1.
create policy "audit_logs_firm_select" on public.audit_logs
  for select using (public.is_firm_member());

-- chat_sessions / chat_messages: NO firm read. Conversations stay between the
-- client and Nick; the firm sees usage through ai_usage_daily (0005).
