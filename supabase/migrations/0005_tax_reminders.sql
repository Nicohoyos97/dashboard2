-- 0005_tax_reminders.sql — Taxes, payroll, reminders, insights, notifications,
-- exports, Nick citations, AI usage, rate limiting (INITIAL_PROMPT.md §5, §7, §10).
--
--   tax_jurisdictions, tax_obligations, tax_payments, payroll_obligations
--   reminders, insights, notifications, generated_exports (+ bucket `exports`)
--   chat_citations, ai_usage_daily, rate_limits + consume_rate_limit()
--
-- Tax figures are firm-document or firm-entry only; nothing is final unless
-- status = 'firm_confirmed' (spec §7 Income Taxes).

-- ── tax_jurisdictions ────────────────────────────────────────────────────────
create table public.tax_jurisdictions (
  id                 uuid primary key default gen_random_uuid(),
  business_entity_id uuid not null references public.business_entities (id) on delete cascade,
  level              text not null check (level in ('federal', 'state', 'local')),
  name               text not null,
  code               text not null,          -- e.g. 'US', 'US-FL', 'US-FL-MIAMI'
  filing_frequency   text check (filing_frequency in ('monthly', 'quarterly', 'annual')),
  created_at         timestamptz not null default now(),
  unique (business_entity_id, level, code)
);

-- ── tax_obligations ──────────────────────────────────────────────────────────
create table public.tax_obligations (
  id                  uuid primary key default gen_random_uuid(),
  business_entity_id  uuid not null references public.business_entities (id) on delete cascade,
  tax_type            text not null check (tax_type in ('income', 'sales', 'payroll')),
  jurisdiction_id     uuid references public.tax_jurisdictions (id) on delete set null,
  tax_year            integer,
  period_start        date,
  period_end          date,
  due_date            date,
  filing_status       text check (filing_status in ('not_filed', 'filed', 'extended', 'amended')),
  amount_estimated    numeric(18,2),
  amount_confirmed    numeric(18,2),
  amount_paid         numeric(18,2),
  amount_payable      numeric(18,2),
  taxable_sales       numeric(18,2),         -- sales tax only
  non_taxable_sales   numeric(18,2),
  tax_collected       numeric(18,2),
  status              text not null default 'pending_review' check (status in (
                        'estimated', 'firm_confirmed', 'paid', 'payable', 'pending_review')),
  confirmation_number text,
  notes               text,                  -- client-visible firm note
  source              text not null check (source in ('firm_document', 'firm_entry')),
  document_version_id uuid references public.document_versions (id) on delete set null,
  page_number         integer check (page_number >= 1),
  confidence          numeric(4,3) check (confidence between 0 and 1),
  published_at        timestamptz,
  published_by        uuid references auth.users (id) on delete set null,
  superseded_by       uuid references public.tax_obligations (id) on delete set null,
  created_by          uuid references auth.users (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index tax_obligations_entity_idx on public.tax_obligations (business_entity_id, tax_type, due_date);

create trigger tax_obligations_set_updated_at
  before update on public.tax_obligations
  for each row execute function public.set_updated_at();

-- ── tax_payments ─────────────────────────────────────────────────────────────
create table public.tax_payments (
  id                  uuid primary key default gen_random_uuid(),
  business_entity_id  uuid not null references public.business_entities (id) on delete cascade,
  obligation_id       uuid not null references public.tax_obligations (id) on delete cascade,
  paid_on             date not null,
  amount              numeric(18,2) not null check (amount >= 0),
  method              text,
  confirmation_number text,
  source              text not null check (source in ('firm_document', 'firm_entry')),
  document_version_id uuid references public.document_versions (id) on delete set null,
  page_number         integer check (page_number >= 1),
  confidence          numeric(4,3) check (confidence between 0 and 1),
  published_at        timestamptz,
  published_by        uuid references auth.users (id) on delete set null,
  created_by          uuid references auth.users (id) on delete set null,
  created_at          timestamptz not null default now()
);

create index tax_payments_entity_idx     on public.tax_payments (business_entity_id, paid_on desc);
create index tax_payments_obligation_idx on public.tax_payments (obligation_id);

-- ── payroll_obligations ──────────────────────────────────────────────────────
create table public.payroll_obligations (
  id                  uuid primary key default gen_random_uuid(),
  business_entity_id  uuid not null references public.business_entities (id) on delete cascade,
  period_start        date,
  period_end          date,
  pay_date            date,
  deposit_due_date    date,
  gross_wages         numeric(18,2),
  tax_deposit_amount  numeric(18,2),
  status              text not null default 'upcoming' check (status in (
                        'upcoming', 'paid', 'overdue', 'needs_confirmation')),
  source              text not null check (source in ('firm_document', 'firm_entry')),
  document_version_id uuid references public.document_versions (id) on delete set null,
  published_at        timestamptz,
  published_by        uuid references auth.users (id) on delete set null,
  created_by          uuid references auth.users (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index payroll_obligations_entity_idx on public.payroll_obligations (business_entity_id, pay_date);

create trigger payroll_obligations_set_updated_at
  before update on public.payroll_obligations
  for each row execute function public.set_updated_at();

-- ── reminders ────────────────────────────────────────────────────────────────
create table public.reminders (
  id                    uuid primary key default gen_random_uuid(),
  business_entity_id    uuid not null references public.business_entities (id) on delete cascade,
  reminder_type         text not null check (reminder_type in (
                          'payroll_date', 'payroll_tax_deposit', 'sales_tax_deadline',
                          'estimated_income_tax', 'loan_payment', 'renewal', 'custom')),
  title                 text not null,
  amount                numeric(18,2),
  due_date              date not null,
  status                text not null default 'upcoming' check (status in (
                          'upcoming', 'due_soon', 'due_today', 'paid', 'completed',
                          'overdue', 'needs_confirmation')),
  responsible           text not null default 'client' check (responsible in ('firm', 'client')),
  action_required       text,
  source                text not null default 'firm_entry' check (source in ('firm_document', 'firm_entry')),
  related_obligation_id uuid references public.tax_obligations (id) on delete set null,
  related_payroll_id    uuid references public.payroll_obligations (id) on delete set null,
  document_version_id   uuid references public.document_versions (id) on delete set null,
  published_at          timestamptz,
  published_by          uuid references auth.users (id) on delete set null,
  completed_at          timestamptz,
  created_by            uuid references auth.users (id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index reminders_entity_idx on public.reminders (business_entity_id, due_date);

create trigger reminders_set_updated_at
  before update on public.reminders
  for each row execute function public.set_updated_at();

-- ── insights ─────────────────────────────────────────────────────────────────
-- Produced by the deterministic rule set in lib/insights/rules.ts (service role).
create table public.insights (
  id                 uuid primary key default gen_random_uuid(),
  business_entity_id uuid not null references public.business_entities (id) on delete cascade,
  rule_key           text not null,
  severity           text not null check (severity in ('info', 'warning', 'critical')),
  title              text not null,
  body               text not null,
  period_start       date,
  period_end         date,
  payload            jsonb not null default '{}'::jsonb,   -- figures + sources for the link
  link_path          text,
  generated_at       timestamptz not null default now(),
  expires_at         timestamptz,
  dismissed_at       timestamptz,
  unique (business_entity_id, rule_key, period_start, period_end)
);

create index insights_entity_idx on public.insights (business_entity_id, generated_at desc);

-- ── notifications ────────────────────────────────────────────────────────────
create table public.notifications (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users (id) on delete cascade,
  business_entity_id uuid references public.business_entities (id) on delete cascade,
  kind               text not null,
  title              text not null,
  body               text,
  link_path          text,
  read_at            timestamptz,
  created_at         timestamptz not null default now()
);

create index notifications_user_idx on public.notifications (user_id, created_at desc);

-- ── generated_exports ────────────────────────────────────────────────────────
create table public.generated_exports (
  id                 uuid primary key default gen_random_uuid(),
  business_entity_id uuid not null references public.business_entities (id) on delete cascade,
  user_id            uuid references auth.users (id) on delete set null,
  kind               text not null check (kind in ('csv', 'pdf')),
  report_id          uuid references public.financial_reports (id) on delete set null,
  storage_path       text unique,            -- exports/{entity}/{export_id}/{filename}
  status             text not null default 'pending' check (status in ('pending', 'ready', 'failed', 'expired')),
  expires_at         timestamptz,
  created_at         timestamptz not null default now()
);

create index generated_exports_entity_idx on public.generated_exports (business_entity_id, created_at desc);

-- ── chat_citations ───────────────────────────────────────────────────────────
-- One row per [cN] marker Nick emits; rendered as a chip
-- ("Profit & Loss · Jan–Jun 2026 · Page 3 · Payroll Expense").
create table public.chat_citations (
  id                  uuid primary key default gen_random_uuid(),
  business_entity_id  uuid not null references public.business_entities (id) on delete cascade,
  session_id          uuid not null references public.chat_sessions (id) on delete cascade,
  message_id          uuid not null references public.chat_messages (id) on delete cascade,
  citation_key        text not null,         -- 'c1', 'c2', …
  label               text not null,
  report_id           uuid references public.financial_reports (id) on delete set null,
  document_version_id uuid references public.document_versions (id) on delete set null,
  line_id             uuid references public.financial_statement_lines (id) on delete set null,
  page_number         integer check (page_number >= 1),
  period_start        date,
  period_end          date,
  source              text check (source in ('firm_document', 'firm_entry')),
  created_at          timestamptz not null default now(),
  unique (message_id, citation_key)
);

create index chat_citations_session_idx on public.chat_citations (session_id, created_at);

-- ── ai_usage_daily ───────────────────────────────────────────────────────────
-- Per-entity daily token budget (spec §10 cost controls). The firm's "Nick
-- usage" view reads this; conversations themselves stay client-only.
create table public.ai_usage_daily (
  business_entity_id uuid not null references public.business_entities (id) on delete cascade,
  day                date not null,
  input_tokens       bigint not null default 0,
  output_tokens      bigint not null default 0,
  messages           integer not null default 0,
  updated_at         timestamptz not null default now(),
  primary key (business_entity_id, day)
);

-- ── rate_limits ──────────────────────────────────────────────────────────────
-- Fixed-window counters (docs/PLAN.md §3.8). Keys are composed server-side
-- (e.g. 'signin:<ip>', 'chat:<user>'); only the service role may call the
-- function, so the counter cannot be poisoned through PostgREST.
create table public.rate_limits (
  key          text primary key,
  window_start timestamptz not null,
  count        integer not null default 0
);

create or replace function public.consume_rate_limit(p_key text, p_max integer, p_window interval)
returns boolean
language sql
security definer
set search_path = public
as $$
  insert into public.rate_limits as r (key, window_start, count)
  values (p_key, now(), 1)
  on conflict (key) do update
    set count = case when r.window_start + p_window <= now() then 1 else r.count + 1 end,
        window_start = case when r.window_start + p_window <= now() then now() else r.window_start end
  returning count <= p_max;
$$;

revoke execute on function public.consume_rate_limit(text, integer, interval) from public, anon, authenticated, service_role;
grant  execute on function public.consume_rate_limit(text, integer, interval) to service_role;

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.tax_jurisdictions   enable row level security;
alter table public.tax_obligations     enable row level security;
alter table public.tax_payments        enable row level security;
alter table public.payroll_obligations enable row level security;
alter table public.reminders           enable row level security;
alter table public.insights            enable row level security;
alter table public.notifications       enable row level security;
alter table public.generated_exports   enable row level security;
alter table public.chat_citations      enable row level security;
alter table public.ai_usage_daily      enable row level security;
alter table public.rate_limits         enable row level security;   -- no policies: service role only

-- tax_jurisdictions — B.
create policy "jurisdictions_member_select" on public.tax_jurisdictions
  for select using (public.is_entity_member(business_entity_id) or public.is_firm_member());
create policy "jurisdictions_admin_insert" on public.tax_jurisdictions
  for insert with check (public.is_firm_admin());
create policy "jurisdictions_admin_update" on public.tax_jurisdictions
  for update using (public.is_firm_admin()) with check (public.is_firm_admin());
create policy "jurisdictions_admin_delete" on public.tax_jurisdictions
  for delete using (public.is_firm_admin());

-- tax_obligations / tax_payments / payroll_obligations — B, members read
-- PUBLISHED rows; firm admin writes; no delete (supersede).
create policy "obligations_member_select" on public.tax_obligations
  for select using (
    (public.is_entity_member(business_entity_id) and published_at is not null)
    or public.is_firm_member()
  );
create policy "obligations_admin_insert" on public.tax_obligations
  for insert with check (public.is_firm_admin());
create policy "obligations_admin_update" on public.tax_obligations
  for update using (public.is_firm_admin()) with check (public.is_firm_admin());

create policy "tax_payments_member_select" on public.tax_payments
  for select using (
    (public.is_entity_member(business_entity_id) and published_at is not null)
    or public.is_firm_member()
  );
create policy "tax_payments_admin_insert" on public.tax_payments
  for insert with check (public.is_firm_admin());
create policy "tax_payments_admin_update" on public.tax_payments
  for update using (public.is_firm_admin()) with check (public.is_firm_admin());

create policy "payroll_member_select" on public.payroll_obligations
  for select using (
    (public.is_entity_member(business_entity_id) and published_at is not null)
    or public.is_firm_member()
  );
create policy "payroll_admin_insert" on public.payroll_obligations
  for insert with check (public.is_firm_admin());
create policy "payroll_admin_update" on public.payroll_obligations
  for update using (public.is_firm_admin()) with check (public.is_firm_admin());

-- reminders — B; firm admin may delete a custom reminder it created by mistake.
create policy "reminders_member_select" on public.reminders
  for select using (
    (public.is_entity_member(business_entity_id) and published_at is not null)
    or public.is_firm_member()
  );
create policy "reminders_admin_insert" on public.reminders
  for insert with check (public.is_firm_admin());
create policy "reminders_admin_update" on public.reminders
  for update using (public.is_firm_admin()) with check (public.is_firm_admin());
create policy "reminders_admin_delete" on public.reminders
  for delete using (public.is_firm_admin());

-- insights — A: members + firm read; the rule engine (service role) writes.
create policy "insights_member_select" on public.insights
  for select using (public.is_entity_member(business_entity_id) or public.is_firm_member());

-- notifications — C: own rows only; the server (service role) inserts.
create policy "notifications_self_select" on public.notifications
  for select using (user_id = auth.uid());
create policy "notifications_self_update" on public.notifications
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- generated_exports — the requesting member sees their own exports; the firm
-- sees all. Rows and files are written server-side (service role).
create policy "exports_member_select" on public.generated_exports
  for select using (
    (public.is_entity_member(business_entity_id) and user_id = auth.uid())
    or public.is_firm_member()
  );

-- chat_citations — A, client-only (conversations are private to the client).
create policy "citations_member_select" on public.chat_citations
  for select using (public.is_entity_member(business_entity_id));

-- ai_usage_daily — firm read only; the chat server (service role) writes.
create policy "ai_usage_firm_select" on public.ai_usage_daily
  for select using (public.is_firm_member());

-- ── storage: bucket `exports` (private) ──────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('exports', 'exports', false, 52428800, array['text/csv', 'application/pdf'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- First path segment as a uuid, or null for anything malformed (never raises).
create or replace function public.object_entity_id(object_name text)
returns uuid
language plpgsql
immutable
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

-- Members of the entity read (signed URL via the download route); the server
-- writes with the service role. No client writes, no deletes.
create policy "exports_member_read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'exports'
    and (public.is_firm_member() or public.is_entity_member(public.object_entity_id(name)))
  );
