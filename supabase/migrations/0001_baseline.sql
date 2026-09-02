-- 0001_baseline.sql
-- Dashboard 2.0 foundation. Consolidated from the v1 repo (Hoyos-Baker-Dashboard
-- migrations 0001, 0002, 0004, 0005, 0006, 0007). Everything QuickBooks-specific
-- (v1 0003 connections, 0008–0010 Vault accessors) and the QB-shaped reports_cache
-- were dropped. Vocabulary renamed to the v2 domain model (INITIAL_PROMPT.md §5):
--
--   organizations         → business_entities      organization_id → business_entity_id
--   organization_members  → entity_memberships     is_member_of    → is_entity_member
--   is_admin_of           → is_entity_owner        shares_org_with → shares_entity_with
--   chat_conversations    → chat_sessions          audit_log       → audit_logs
--   roles owner/admin/member/viewer → client_owner / client_viewer
--
-- Deliberate semantic changes vs v1 (see docs/ASSUMPTIONS.md):
--   * No self-serve create_organization() RPC. Businesses are provisioned by the
--     firm (§8); a signed-in user with no membership sees a pending state.
--   * business_entities.created_by is nullable + ON DELETE SET NULL: the creator
--     is a firm admin, and deleting that account must never cascade to client data.
--   * No client DELETE on business_entities. No client read on audit_logs
--     (firm-admin read arrives with is_firm_admin() in Phase 1).
--
-- RLS archetypes per .claude/skills/writing-rls-policies. Firm-side tables,
-- is_firm_admin(), MFA gating and every §5 ingestion table are Phase 1 work.

-- ── profiles ─────────────────────────────────────────────────────────────────
-- Mirrors auth.users. Populated by handle_new_user(); never inserted by clients.
create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  email      text,
  full_name  text,
  avatar_url text,
  created_at timestamptz not null default now()
);

comment on table public.profiles is
  'Mirror of auth.users, populated by the handle_new_user() trigger.';

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'avatar_url'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── business_entities ────────────────────────────────────────────────────────
-- A client's company — the tenant boundary. Every tenant table carries
-- business_entity_id. Fiscal/config columns (§5) are added in Phase 1.
create table public.business_entities (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  legal_name  text,
  address     jsonb,
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ── entity_memberships ───────────────────────────────────────────────────────
-- Which users may see which business. Roles are client-side only; firm roles
-- live in firm_memberships (Phase 1).
create table public.entity_memberships (
  business_entity_id uuid not null references public.business_entities (id) on delete cascade,
  user_id            uuid not null references auth.users (id) on delete cascade,
  role               text not null check (role in ('client_owner','client_viewer')),
  invited_by         uuid references auth.users (id) on delete set null,
  joined_at          timestamptz not null default now(),
  primary key (business_entity_id, user_id)
);

create index entity_memberships_user_idx on public.entity_memberships (user_id);

-- ── updated_at trigger ───────────────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger business_entities_set_updated_at
  before update on public.business_entities
  for each row execute function public.set_updated_at();

-- ── membership helpers ───────────────────────────────────────────────────────
-- security definer so the membership check bypasses RLS on entity_memberships
-- (otherwise the memberships SELECT policy would recurse). search_path pinned.
create or replace function public.is_entity_member(entity uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.entity_memberships
    where business_entity_id = entity and user_id = auth.uid()
  );
$$;

create or replace function public.is_entity_owner(entity uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.entity_memberships
    where business_entity_id = entity and user_id = auth.uid()
      and role = 'client_owner'
  );
$$;

-- "Do I share any business with this user?" — reads entity_memberships only, so
-- the profiles policy below never recurses into profiles.
create or replace function public.shares_entity_with(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.entity_memberships me
    join public.entity_memberships them
      on me.business_entity_id = them.business_entity_id
    where me.user_id = auth.uid()
      and them.user_id = target
  );
$$;

-- ── chat_sessions / chat_messages ────────────────────────────────────────────
create table public.chat_sessions (
  id                  uuid primary key default gen_random_uuid(),
  business_entity_id  uuid not null references public.business_entities (id) on delete cascade,
  user_id             uuid references auth.users (id) on delete set null,
  title               text,
  created_at          timestamptz not null default now(),
  last_message_at     timestamptz,
  total_input_tokens  integer not null default 0,
  total_output_tokens integer not null default 0
);

create index chat_sessions_entity_idx
  on public.chat_sessions (business_entity_id, last_message_at desc);

create table public.chat_messages (
  id                 uuid primary key default gen_random_uuid(),
  session_id         uuid not null references public.chat_sessions (id) on delete cascade,
  business_entity_id uuid not null references public.business_entities (id) on delete cascade, -- denormalized for RLS
  role               text not null check (role in ('user','assistant','tool')),
  content            jsonb not null,
  created_at         timestamptz not null default now()
);

create index chat_messages_session_idx
  on public.chat_messages (session_id, created_at);

-- ── audit_logs ───────────────────────────────────────────────────────────────
create table public.audit_logs (
  id                 bigserial primary key,
  actor_id           uuid references auth.users (id) on delete set null,               -- nullable: system actions
  business_entity_id uuid references public.business_entities (id) on delete cascade,  -- nullable: system actions
  action             text not null,
  resource_type      text,
  resource_id        text,
  metadata           jsonb,        -- small, no PII / no financial figures
  ip                 inet,
  user_agent         text,
  created_at         timestamptz not null default now()
);

create index audit_logs_entity_idx on public.audit_logs (business_entity_id, created_at desc);
create index audit_logs_actor_idx  on public.audit_logs (actor_id, created_at desc);

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.profiles           enable row level security;
alter table public.business_entities  enable row level security;
alter table public.entity_memberships enable row level security;
alter table public.chat_sessions      enable row level security;
alter table public.chat_messages      enable row level security;
alter table public.audit_logs         enable row level security;

-- profiles — Archetype C (self) + co-member read. No INSERT (trigger) / DELETE (cascade).
create policy "profiles_self_select" on public.profiles
  for select using (id = auth.uid());

create policy "profiles_comember_select" on public.profiles
  for select using (public.shares_entity_with(id));

create policy "profiles_self_update" on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- business_entities — Archetype B: members read; client_owner edits the profile
-- fields (name / legal_name / address). No client INSERT or DELETE: the firm
-- provisions and retires businesses.
create policy "entities_member_select" on public.business_entities
  for select using (public.is_entity_member(id));

create policy "entities_owner_update" on public.business_entities
  for update using (public.is_entity_owner(id)) with check (public.is_entity_owner(id));

-- entity_memberships — visible to fellow members only; all writes server-side.
create policy "memberships_member_select" on public.entity_memberships
  for select using (public.is_entity_member(business_entity_id));

-- chat_sessions — Archetype B: members read; a member starts their own session.
create policy "sessions_member_select" on public.chat_sessions
  for select using (public.is_entity_member(business_entity_id));

create policy "sessions_member_insert" on public.chat_sessions
  for insert with check (public.is_entity_member(business_entity_id) and user_id = auth.uid());

-- chat_messages — Archetype A: members read; all writes via service role.
create policy "messages_member_select" on public.chat_messages
  for select using (public.is_entity_member(business_entity_id));

-- audit_logs — Archetype A writes, NO client read (default deny). Firm-admin read
-- lands with is_firm_admin() in Phase 1.

-- ── avatars storage bucket ───────────────────────────────────────────────────
-- Profile photos. Path: avatars/<uid>/<filename>. Public read (co-members see each
-- other's avatar without signed URLs); writes restricted to the owner's folder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  2097152, -- 2 MB
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "avatars_public_read" on storage.objects
  for select using (bucket_id = 'avatars');

create policy "avatars_owner_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "avatars_owner_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "avatars_owner_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- ── function hardening ───────────────────────────────────────────────────────
-- Supabase grants EXECUTE to PUBLIC and explicitly to anon/authenticated/
-- service_role. Revoke from every grantee, then re-grant only what each function
-- needs, so the end state is deterministic.
--   * Trigger functions: no role needs EXECUTE.
--   * RLS helpers run inside policies with the querying role's privileges, so
--     authenticated must keep EXECUTE; service_role too. anon loses it — no public
--     route reads tenant tables anonymously (an anon query gets a controlled 42501).
revoke execute on function public.set_updated_at() from public, anon, authenticated, service_role;
revoke execute on function public.handle_new_user() from public, anon, authenticated, service_role;

revoke execute on function public.is_entity_member(uuid) from public, anon, authenticated, service_role;
grant  execute on function public.is_entity_member(uuid) to authenticated, service_role;

revoke execute on function public.is_entity_owner(uuid) from public, anon, authenticated, service_role;
grant  execute on function public.is_entity_owner(uuid) to authenticated, service_role;

revoke execute on function public.shares_entity_with(uuid) from public, anon, authenticated, service_role;
grant  execute on function public.shares_entity_with(uuid) to authenticated, service_role;
