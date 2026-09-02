---
name: writing-rls-policies
description: Use this skill whenever you create, modify, or review Row Level Security policies in this project, or when you create a new Postgres table or storage bucket that holds any tenant data. Covers the membership pattern, the three archetypes, the "no write policy" pattern for server-only tables, the helpers is_entity_member / is_entity_owner / is_firm_admin, storage policies, the anti-patterns to avoid, and the verification checklist. Trigger this skill any time a migration introduces a new table or bucket, alters RLS, or changes the entity_memberships / firm_memberships shape.
---

# Writing RLS policies

The single most important security control in this project. Read this in full before writing or changing a policy.

## The core pattern

Every table that stores tenant data has a `business_entity_id` column and policies that check membership via the helper (defined in `0001_baseline.sql`):

```sql
create or replace function public.is_entity_member(entity uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.entity_memberships
    where business_entity_id = entity and user_id = auth.uid()
  );
$$;
```

**Why a function?** Reusable, indexable, and `security definer` lets it bypass RLS *for the membership check itself* (otherwise the policy on `entity_memberships` would recurse).

Sibling helpers: `is_entity_owner(entity)` (role = `client_owner`), `shares_entity_with(target)` (profiles), and — Phase 1 — `is_firm_admin()` (`firm_memberships` + `aal2` from `auth.jwt() ->> 'aal'`). Every new helper: `security definer`, `search_path` pinned, EXECUTE revoked from `public`/`anon` and granted to `authenticated` + `service_role` only.

**Firm access.** Tenant `SELECT` policies are written as `is_entity_member(business_entity_id) OR is_firm_admin()`. Firm-admin *writes* on configuration/ingestion tables use `is_firm_admin()` in both `USING` and `WITH CHECK`. Never give the firm access through the service role in a request handler.

## Table archetypes

There are three archetypes. Picking the right one is most of the work.

### Archetype A — Read-only by members, written by server only

Tables: `chat_messages`, `audit_logs`, and every derived record — `document_pages`, `financial_statement_lines`, `bank_transactions`, `insights`, `chat_citations`.

```sql
alter table financial_statement_lines enable row level security;

create policy "lines_member_select" on financial_statement_lines for select
  using (public.is_entity_member(business_entity_id) or public.is_firm_admin());

-- No INSERT/UPDATE/DELETE policies. The processing job (service role) writes.
```

Use this when **only server code** ever writes the row. Removes an entire class of "user crafted insert" bugs. `audit_logs` goes one step further: **no client SELECT either** (firm-admin read only).

### Archetype B — Members read, role-gated writes

Tables: `business_entities`, `chat_sessions`, and firm-managed configuration such as `documents`, `financial_reports`, `reminders`, `tax_obligations`.

```sql
create policy "entities_member_select" on business_entities for select
  using (public.is_entity_member(id) or public.is_firm_admin());

create policy "entities_owner_update" on business_entities for update
  using (public.is_entity_owner(id))
  with check (public.is_entity_owner(id));   -- same condition post-update: no moving rows out

create policy "documents_firm_insert" on documents for insert
  with check (public.is_firm_admin());
```

Always include a `WITH CHECK` clause on `UPDATE` and `INSERT` mirroring `USING`, to prevent moving rows into another tenant.

### Archetype C — Self-only

Tables: `profiles` (plus the co-member read via `shares_entity_with`).

```sql
create policy "profiles_self_select" on profiles for select using (id = auth.uid());
create policy "profiles_self_update" on profiles for update
  using (id = auth.uid()) with check (id = auth.uid());
```

## Storage buckets

Storage RLS mirrors table RLS. Every document bucket is **private**; paths embed the tenant so the policy can check membership from the path:

```sql
-- documents/{business_entity_id}/{document_id}/v{n}/{filename}
create policy "documents_member_read" on storage.objects for select
  to authenticated
  using (
    bucket_id = 'documents'
    and (public.is_entity_member(((storage.foldername(name))[1])::uuid) or public.is_firm_admin())
  );
-- Writes: firm admin only (or service role). Reads reach the client only through the
-- download route handler + a signed URL (≤ 60 s), never a public URL.
```

The only public-read bucket is `avatars` (owner-folder writes) — a documented exception.

## Anti-patterns — do not do these

❌ **`USING (true)` then "we'll filter in the app"** — defeats the entire purpose. Tools, jobs, and Postgres clients bypass app-level filters.

❌ **Forgetting `WITH CHECK`** — a user can `UPDATE` a row's `business_entity_id` to a tenant they're not in.

❌ **Permissive policies on the membership table itself** — members only see rows where they are involved:

```sql
create policy "memberships_member_select" on entity_memberships for select
  using (public.is_entity_member(business_entity_id));
```

Writes to memberships are firm-admin / server-side only.

❌ **Trusting `current_setting` for the tenant id** — `auth.uid()` is enforced by Supabase; custom session vars are not.

❌ **`security definer` functions that read tenant data to "simplify" a query** — a helper may answer a yes/no membership question; it must not return rows across tenants.

❌ **A client-facing insert path for derived data** — extractions, lines, insights and citations are produced by server code; a client policy there lets a user fabricate financial figures.

## Verification checklist for new tables

Before merging a migration that adds a table with `business_entity_id`:

- [ ] `alter table … enable row level security;`
- [ ] `SELECT` policy filters by `is_entity_member(business_entity_id)` (+ `or is_firm_admin()` where the firm needs it)
- [ ] `INSERT` policy (if any) has `WITH CHECK` mirroring the `USING`
- [ ] `UPDATE` policy (if any) has `WITH CHECK`
- [ ] `DELETE` policy (if any) is role-gated, not just membership-gated, when destructive — and history-preserving tables (documents, reports) have **no** delete at all (supersede instead)
- [ ] An index exists on `(business_entity_id, …)`
- [ ] Derived-record columns present: `source`, `document_version_id`, `page_number`, `confidence`, `published_at/by`, `superseded_by` (INITIAL_PROMPT.md §5)
- [ ] `tests/e2e/rls.spec.ts` asserts a user in business A cannot SELECT/INSERT/UPDATE/DELETE rows of business B, and (Phase 1+) that a firm admin without `aal2` is blocked

## How to test RLS

In Playwright (`tests/e2e/rls.spec.ts`), create real users via the service role, provision businesses + memberships the way the admin portal will, sign in as each, and try every verb. Assert with **positive controls** too (the owner *can* read its own rows) so "0 rows" proves a block, not an empty table.

In SQL, simulate a user:

```sql
set local role authenticated;
set local request.jwt.claim.sub = '<user-x-uuid>';

select * from business_entities;                                  -- only X's businesses
select * from documents where business_entity_id = '<other>';      -- empty
```

## Default-deny first, then add policies

A table with RLS enabled and **zero policies** denies all access. That's the safe default. Add policies one at a time and verify each before adding the next.

## Files where this matters most

- `supabase/migrations/0001_baseline.sql` — base tables, helpers, avatars bucket, hardening
- `supabase/migrations/0002+` — firm tables, `is_firm_admin()`, documents bucket, ingestion tables (Phase 1)
- `tests/e2e/rls.spec.ts` — cross-tenant isolation test
- `docs/DATABASE.md` — the living table inventory
