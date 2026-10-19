-- 0031_rls_once_per_query.sql
-- The same read rules, evaluated once per query instead of once per row.
--
-- Every member read policy was written as
--   (public.is_entity_member(business_entity_id) and …) or public.is_firm_member()
-- and both helpers are SECURITY DEFINER with a pinned search_path, which
-- Postgres can neither inline nor cache: each row read ran an index probe on
-- entity_memberships, re-read the JWT and probed firm_memberships. The busiest
-- tables added a third call per row (bank_statement_is_published,
-- report_is_published, ledger_account_is_client_visible, …). An Expenses render
-- reads a period's transactions three or four times over, and Nick's search
-- reads a year of ledger lines, so the cost grew with exactly the rows that
-- matter most.
--
-- Supabase's documented fix, applied without changing who can read what:
--   · a check that does not depend on the row is wrapped in `(select …)`, which
--     Postgres evaluates once per statement (an InitPlan);
--   · a check that does is written `column in (select set_function())`, where
--     the function returns the caller's set once — their businesses, the
--     published statements of those businesses — and each row is then a hash
--     lookup.
-- The set functions are SECURITY DEFINER like the helpers they replace, scoped
-- to the caller's own businesses, and return nothing a caller could not
-- already read. Where a table had two or three permissive SELECT policies,
-- which Postgres evaluates one after another for every row the first one
-- refuses, they become one; a `for all` admin policy, which also counted as a
-- SELECT policy, becomes separate insert / update / delete policies.
--
-- Write policies keep their wording: they touch a handful of rows per action.

-- ── the caller's sets ────────────────────────────────────────────────────────
create or replace function public.member_entity_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select business_entity_id from public.entity_memberships where user_id = auth.uid();
$$;

-- Users who share a business with the caller (was shares_entity_with, per row).
create or replace function public.comember_user_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select them.user_id
    from public.entity_memberships me
    join public.entity_memberships them on them.business_entity_id = me.business_entity_id
   where me.user_id = auth.uid();
$$;

create or replace function public.published_report_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.financial_reports
   where status = 'published' and business_entity_id in (select public.member_entity_ids());
$$;

create or replace function public.published_bank_statement_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.bank_statements
   where status = 'published' and business_entity_id in (select public.member_entity_ids());
$$;

create or replace function public.published_sales_report_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.sales_reports
   where status = 'published' and business_entity_id in (select public.member_entity_ids());
$$;

create or replace function public.published_ledger_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.general_ledgers
   where status = 'published' and business_entity_id in (select public.member_entity_ids());
$$;

-- The accounts publication matched to a P&L line, on a published ledger (0026).
create or replace function public.visible_ledger_account_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select a.id
    from public.general_ledgers l
    join public.ledger_accounts a on a.ledger_id = l.id
   where l.status = 'published'
     and a.client_visible
     and l.business_entity_id in (select public.member_entity_ids());
$$;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'member_entity_ids', 'comember_user_ids', 'published_report_ids', 'published_bank_statement_ids',
    'published_sales_report_ids', 'published_ledger_ids', 'visible_ledger_account_ids'
  ] loop
    execute format('revoke execute on function public.%I() from public, anon', fn);
    execute format('grant execute on function public.%I() to authenticated, service_role', fn);
  end loop;
end;
$$;

-- ── firm-only reads ──────────────────────────────────────────────────────────
alter policy "ai_usage_firm_select" on public.ai_usage_daily using ((select public.is_firm_member()));
alter policy "audit_logs_firm_select" on public.audit_logs using ((select public.is_firm_member()));
alter policy "clients_firm_select" on public.clients using ((select public.is_firm_member()));
alter policy "pages_firm_select" on public.document_pages using ((select public.is_firm_member()));
alter policy "jobs_firm_select" on public.document_processing_jobs using ((select public.is_firm_member()));
alter policy "entity_firm_notes_firm_select" on public.entity_firm_notes using ((select public.is_firm_member()));
alter policy "firms_firm_select" on public.firms using ((select public.is_firm_member()));
alter policy "general_ledgers_firm_select" on public.general_ledgers using ((select public.is_firm_member()));

-- ── member or firm ───────────────────────────────────────────────────────────
alter policy "entities_member_select" on public.business_entities
  using ((select public.is_firm_member()) or id in (select public.member_entity_ids()));
alter policy "memberships_member_select" on public.entity_memberships
  using ((select public.is_firm_member()) or business_entity_id in (select public.member_entity_ids()));
alter policy "bank_accounts_member_select" on public.bank_accounts
  using ((select public.is_firm_member()) or business_entity_id in (select public.member_entity_ids()));
alter policy "categories_member_select" on public.expense_categories
  using ((select public.is_firm_member()) or business_entity_id in (select public.member_entity_ids()));
alter policy "periods_member_select" on public.financial_periods
  using ((select public.is_firm_member()) or business_entity_id in (select public.member_entity_ids()));
alter policy "insights_member_select" on public.insights
  using ((select public.is_firm_member()) or business_entity_id in (select public.member_entity_ids()));
alter policy "jurisdictions_member_select" on public.tax_jurisdictions
  using ((select public.is_firm_member()) or business_entity_id in (select public.member_entity_ids()));

-- Published rows only.
alter policy "reports_member_select" on public.financial_reports
  using ((select public.is_firm_member()) or (business_entity_id in (select public.member_entity_ids()) and status = 'published'));
alter policy "bank_statements_member_select" on public.bank_statements
  using ((select public.is_firm_member()) or (business_entity_id in (select public.member_entity_ids()) and status = 'published'));
alter policy "obligations_member_select" on public.tax_obligations
  using ((select public.is_firm_member()) or (business_entity_id in (select public.member_entity_ids()) and published_at is not null));
alter policy "tax_payments_member_select" on public.tax_payments
  using ((select public.is_firm_member()) or (business_entity_id in (select public.member_entity_ids()) and published_at is not null));
alter policy "payroll_member_select" on public.payroll_obligations
  using ((select public.is_firm_member()) or (business_entity_id in (select public.member_entity_ids()) and published_at is not null));
alter policy "reminders_member_select" on public.reminders
  using ((select public.is_firm_member()) or (business_entity_id in (select public.member_entity_ids()) and published_at is not null));

-- Rows under a published parent.
alter policy "lines_member_select" on public.financial_statement_lines
  using ((select public.is_firm_member())
         or (business_entity_id in (select public.member_entity_ids()) and report_id in (select public.published_report_ids())));
alter policy "transactions_member_select" on public.bank_transactions
  using ((select public.is_firm_member())
         or (business_entity_id in (select public.member_entity_ids()) and bank_statement_id in (select public.published_bank_statement_ids())));

-- Documents (0025): the client's row, and the bytes of its current version.
alter policy "documents_member_select" on public.documents
  using ((select public.is_firm_member())
         or (business_entity_id in (select public.member_entity_ids())
             and status = 'published'
             and public.document_type_is_client_visible(document_type)));
alter policy "versions_member_select" on public.document_versions
  using ((select public.is_firm_member())
         or (business_entity_id in (select public.member_entity_ids())
             and exists (
               select 1 from public.documents d
                where d.id = document_versions.document_id
                  and d.status = 'published'
                  and d.current_version_id = document_versions.id
                  and public.document_type_is_client_visible(d.document_type))));

-- ── the caller's own rows ────────────────────────────────────────────────────
alter policy "citations_member_select" on public.chat_citations
  using (business_entity_id in (select public.member_entity_ids()));
alter policy "messages_member_select" on public.chat_messages
  using (business_entity_id in (select public.member_entity_ids()));
alter policy "sessions_member_select" on public.chat_sessions
  using (business_entity_id in (select public.member_entity_ids()));
alter policy "notifications_self_select" on public.notifications
  using (user_id = (select auth.uid()));
alter policy "notification_prefs_self_select" on public.notification_preferences
  using (user_id = (select auth.uid()) and business_entity_id in (select public.member_entity_ids()));
alter policy "insight_dismissals_self_select" on public.insight_dismissals
  using (user_id = (select auth.uid()) and business_entity_id in (select public.member_entity_ids()));
alter policy "exports_member_select" on public.generated_exports
  using ((select public.is_firm_member())
         or (business_entity_id in (select public.member_entity_ids()) and user_id = (select auth.uid())));
alter policy "account_requests_select" on public.account_requests
  using ((select public.is_firm_member())
         or (user_id = (select auth.uid()) and business_entity_id in (select public.member_entity_ids())));

-- ── several SELECT policies become one ───────────────────────────────────────
drop policy "profiles_self_select" on public.profiles;
drop policy "profiles_comember_select" on public.profiles;
drop policy "profiles_firm_select" on public.profiles;
create policy "profiles_select" on public.profiles
  for select using (
    id = (select auth.uid())
    or (select public.is_firm_member())
    or id in (select public.comember_user_ids())
  );

drop policy "firm_memberships_self_select" on public.firm_memberships;
drop policy "firm_memberships_firm_select" on public.firm_memberships;
create policy "firm_memberships_select" on public.firm_memberships
  for select using ((select public.is_firm_member()) or user_id = (select auth.uid()));

drop policy "sales_reports_member_select" on public.sales_reports;
drop policy "sales_reports_firm_select" on public.sales_reports;
create policy "sales_reports_select" on public.sales_reports
  for select using (
    (select public.is_firm_member())
    or (business_entity_id in (select public.member_entity_ids()) and status = 'published')
  );

-- These three also had a `for all` admin policy, which Postgres counts as a
-- SELECT policy too. A firm admin is a firm member, so the merged SELECT
-- covers them; their writes keep exactly what `for all` allowed.
drop policy "sales_report_tenders_member_select" on public.sales_report_tenders;
drop policy "sales_report_tenders_firm_select" on public.sales_report_tenders;
drop policy "sales_report_tenders_admin_write" on public.sales_report_tenders;
create policy "sales_report_tenders_select" on public.sales_report_tenders
  for select using (
    (select public.is_firm_member())
    or (business_entity_id in (select public.member_entity_ids())
        and sales_report_id in (select public.published_sales_report_ids()))
  );
create policy "sales_report_tenders_admin_insert" on public.sales_report_tenders
  for insert to authenticated with check ((select public.is_firm_admin()));
create policy "sales_report_tenders_admin_update" on public.sales_report_tenders
  for update to authenticated using ((select public.is_firm_admin())) with check ((select public.is_firm_admin()));
create policy "sales_report_tenders_admin_delete" on public.sales_report_tenders
  for delete to authenticated using ((select public.is_firm_admin()));

drop policy "ledger_accounts_member_select" on public.ledger_accounts;
drop policy "ledger_accounts_firm_select" on public.ledger_accounts;
drop policy "ledger_accounts_admin_write" on public.ledger_accounts;
create policy "ledger_accounts_select" on public.ledger_accounts
  for select using (
    (select public.is_firm_member())
    or (business_entity_id in (select public.member_entity_ids())
        and client_visible
        and ledger_id in (select public.published_ledger_ids()))
  );
create policy "ledger_accounts_admin_insert" on public.ledger_accounts
  for insert to authenticated with check ((select public.is_firm_admin()));
create policy "ledger_accounts_admin_update" on public.ledger_accounts
  for update to authenticated using ((select public.is_firm_admin())) with check ((select public.is_firm_admin()));
create policy "ledger_accounts_admin_delete" on public.ledger_accounts
  for delete to authenticated using ((select public.is_firm_admin()));

drop policy "ledger_transactions_member_select" on public.ledger_transactions;
drop policy "ledger_transactions_firm_select" on public.ledger_transactions;
drop policy "ledger_transactions_admin_write" on public.ledger_transactions;
create policy "ledger_transactions_select" on public.ledger_transactions
  for select using (
    (select public.is_firm_member())
    or (business_entity_id in (select public.member_entity_ids())
        and account_id in (select public.visible_ledger_account_ids()))
  );
create policy "ledger_transactions_admin_insert" on public.ledger_transactions
  for insert to authenticated with check ((select public.is_firm_admin()));
create policy "ledger_transactions_admin_update" on public.ledger_transactions
  for update to authenticated using ((select public.is_firm_admin())) with check ((select public.is_firm_admin()));
create policy "ledger_transactions_admin_delete" on public.ledger_transactions
  for delete to authenticated using ((select public.is_firm_admin()));
