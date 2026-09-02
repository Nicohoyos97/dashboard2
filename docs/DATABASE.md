# Database

Postgres on Supabase. Every tenant table carries `business_entity_id`, has RLS enabled, and an index on `(business_entity_id, …)`. This doc describes the **baseline** shipped in `supabase/migrations/0001_baseline.sql`; the §5 tables of `INITIAL_PROMPT.md` (`firms`, `firm_memberships`, `clients`, `documents`, …) are added by new migrations in Phase 1+. Keep this file current as tables land.

## Baseline schema

| Table | Purpose | Archetype | Client policies |
|---|---|---|---|
| `profiles` | Mirror of `auth.users` (email, full_name, avatar_url). Populated by the `handle_new_user()` trigger. | C + co-member read | self SELECT/UPDATE; co-member SELECT via `shares_entity_with()` |
| `business_entities` | A client's company — the tenant boundary. `created_by` nullable, `ON DELETE SET NULL` (the creator is a firm admin). | B | member SELECT; `client_owner` UPDATE (name / legal_name / address). **No client INSERT/DELETE** — the firm provisions and retires businesses. |
| `entity_memberships` | `(business_entity_id, user_id, role)`, `role ∈ {client_owner, client_viewer}` | membership | fellow-member SELECT only; all writes server-side |
| `chat_sessions` | Nick threads per business | B | member SELECT; member INSERT own (`user_id = auth.uid()`) |
| `chat_messages` | Messages; `business_entity_id` denormalized for RLS | A | member SELECT; **no writes** (service role) |
| `audit_logs` | Who / what business / action / when. Metadata is small, no PII, no figures. | A | **none** — default deny. Firm-admin read arrives with `is_firm_admin()` (Phase 1). Written only by `logAccess()`. |

Storage: bucket `avatars` (public read by design, 2 MB, png/jpg/webp), path `avatars/<uid>/…`, writes restricted to the owner's folder. Every other bucket (Phase 1+: `documents`) is **private**.

## Helpers (`security definer`, `search_path` pinned)

| Function | Returns | Used by |
|---|---|---|
| `is_entity_member(entity uuid)` | caller is a member | every tenant SELECT policy |
| `is_entity_owner(entity uuid)` | caller is `client_owner` | `entities_owner_update` |
| `shares_entity_with(target uuid)` | caller and target share a business | `profiles_comember_select` |
| `is_firm_admin()` | **Phase 1** — `firm_memberships` + `aal2` | tenant SELECT policies become `is_entity_member(...) OR is_firm_admin()` |

EXECUTE is revoked from `public`/`anon` and granted to `authenticated` + `service_role` only. Trigger functions (`handle_new_user`, `set_updated_at`) are executable by nobody. An anonymous query against a tenant table returns no rows or a controlled `42501` — guarded by `tests/e2e/rls.spec.ts`.

There is **no self-serve `create_organization()`** anymore. A user who signs up (Google or email) has a `profiles` row and nothing else until the firm links them to a business.

## Three RLS archetypes (see skill `writing-rls-policies`)

- **A — server-write only.** Members read; no client write policy; the service role (jobs, `logAccess`) writes. `chat_messages`, `audit_logs`, and every derived/ingestion table (extractions, insights, statement lines).
- **B — members read, role-gated writes.** `business_entities`, `chat_sessions`. Every `INSERT`/`UPDATE` policy has a `WITH CHECK` mirroring `USING`.
- **C — self-only.** `profiles`.

## Adding a table — checklist

1. Migration file `supabase/migrations/NNNN_<name>.sql` (four-digit, sequential).
2. `business_entity_id uuid not null references public.business_entities (id) on delete cascade` + index.
3. `alter table … enable row level security;` then policies one at a time, default-deny first.
4. Derived records store `source`, `document_version_id`, `page_number`, `confidence`, `published_at/by`, `superseded_by` (spec §5).
5. `pnpm db:reset` → `pnpm db:types` → commit `lib/supabase/types.ts`.
6. Extend `tests/e2e/rls.spec.ts`: user A cannot SELECT/INSERT/UPDATE/DELETE B's rows; firm admin without `aal2` is blocked.
7. Update the table above.

## Migration workflow

```bash
# local
pnpm supabase:start        # applies all migrations on first start
pnpm db:reset              # wipe + re-apply + seed
pnpm db:types              # regenerate types (commit them)

# cloud (after the 2.0 project exists — docs/ENVIRONMENTS.md)
npx supabase link --project-ref <ref>
npx supabase db push       # applies pending migrations; review the SQL first
```

Never apply schema changes through the Supabase MCP or Studio without the same SQL committed under `supabase/migrations/` — the migration history is the asset.
