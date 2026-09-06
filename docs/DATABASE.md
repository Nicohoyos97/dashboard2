# Database

Postgres on Supabase. Every tenant table carries `business_entity_id`, has RLS enabled, and an index on `(business_entity_id, …)`. Migrations live in `supabase/migrations/` (four-digit, sequential); `lib/supabase/types.ts` is generated from them (`pnpm db:types`) and committed. Keep this inventory current as tables land.

## Schema inventory

| Migration | Table | Purpose | Archetype | Client policies |
|---|---|---|---|---|
| 0001 | `profiles` | Mirror of `auth.users`, populated by `handle_new_user()` | C + co-member read | self SELECT/UPDATE; co-member SELECT; **firm SELECT** (0002) |
| 0001 | `business_entities` | The tenant boundary. 0002 adds `client_id`, `fiscal_year_start_month`, `accounting_basis`, `currency`, `sales_tax_enabled`, `enabled_modules`, `status` | B | member SELECT; `client_owner` UPDATE (profile fields only — `guard_entity_firm_columns` trigger blocks firm-controlled columns); firm admin INSERT/UPDATE; no DELETE |
| 0001 | `entity_memberships` | `(business_entity_id, user_id, role)`, `client_owner` / `client_viewer` | membership | member SELECT; firm admin INSERT/UPDATE/DELETE |
| 0001 | `chat_sessions` / `chat_messages` | Nick threads and messages | B / A | member SELECT; member starts own session; **the member who started a session may DELETE it** (0006, messages and citations cascade); **no firm read** (conversations are private) |
| 0001 | `audit_logs` | Who / what business / action / when; identifiers only | A | no client read; firm SELECT (0002); written by `logAccess()` |
| 0002 | `firms`, `firm_memberships` | The firm and its staff (`master_admin` / `firm_staff`) | firm | own `firm_memberships` row readable at aal1; everything else firm-only |
| 0002 | `clients` | A firm client that owns one or more businesses | firm | firm SELECT; firm admin INSERT/UPDATE; archived, never deleted |
| 0002 | `entity_firm_notes` | Firm-internal notes per business (separate table so no client policy can reach them) | firm | firm SELECT; firm admin writes |
| 0003 | `documents` | Client-visible document record (type, title, period, status, current version) | B | member SELECT **published only**; firm admin INSERT/UPDATE; no DELETE |
| 0003 | `document_versions` | Immutable bytes: `storage_path`, `sha256`, `page_count`, `version_no`, `supersedes_version_id` | B | member SELECT of the **current version of a published document**; firm admin INSERT/UPDATE |
| 0003 | `document_pages` | Per-page classification written by the worker | A | firm SELECT only |
| 0003 | `document_processing_jobs` | DB-backed queue (`pending → running → succeeded/failed`, `step`, `attempts`, `error_code`) | A | firm SELECT; firm admin INSERT/UPDATE (re-queue); worker via `claim_processing_jobs()` |
| 0004 | `financial_periods` | Periods that have data (period selector) | B | member SELECT; firm admin writes |
| 0004 | `financial_reports` | One P&L / Balance Sheet per period with `status`, `reconciliation`, `confidence` | B | member SELECT **published only**; firm admin INSERT/UPDATE |
| 0004 | `financial_statement_lines` | The statement; hierarchy via `parent_line_id` / `depth` / `is_section` / `is_total`; `extracted_*` keep the model's values, `current`/`prior` the corrected ones | A | member SELECT via `report_is_published()`; firm admin INSERT/UPDATE/DELETE (corrections, firm entries) |
| 0004 | `bank_accounts`, `bank_statements`, `bank_transactions` | Bank activity; every transaction hangs off a statement (`kind = statement | csv_export`) that carries publication | B / B / A | accounts: member SELECT; statements: member SELECT **published only**; transactions via `bank_statement_is_published()`; firm admin writes |
| 0004 | `expense_categories` | Per-business category list | B | member SELECT; firm admin writes |
| 0005 | `tax_jurisdictions`, `tax_obligations`, `tax_payments`, `payroll_obligations` | Tax and payroll figures — firm document or firm entry only | B | member SELECT **published only** (`published_at`); firm admin INSERT/UPDATE; no DELETE |
| 0005 | `reminders` | Obligations with type, status, due date, responsible | B | member SELECT **published only**; firm admin INSERT/UPDATE/DELETE |
| 0005 | `insights` | Deterministic rule output (3–5 prioritized) | A | member + firm SELECT; service role writes |
| 0005 | `notifications` | Per-user inbox | C | self SELECT/UPDATE; service role inserts |
| 0005 | `generated_exports` | CSV/PDF exports (bucket `exports`) | A | requesting member SELECT own; firm SELECT |
| 0005 | `chat_citations` | One row per `[cN]` marker Nick emits | A | member SELECT only (no firm) |
| 0005 | `ai_usage_daily` | Per-entity daily token budget | A | firm SELECT only |
| 0005 | `rate_limits` | Fixed-window counters | server-only | no policies; `consume_rate_limit()` is service-role only |
| 0007 | `notification_preferences` | Per user, per business: which alerts they want | C | self SELECT/INSERT/UPDATE **and** member of the business; no firm read (delivery settings, not tenant data) |
| 0007 / 0009 / 0013 | `account_requests` | Data-export / account-deletion requests queued for the firm | B | owner + firm SELECT; owner INSERT (`pending` only — `account_requests_guard()` refuses `firm_note`/`resolved_*` and stamps `requested_at` itself); owner UPDATE limited to `pending → cancelled` by the same guard, which stamps `resolved_at`; firm admin UPDATE, constrained by the same guard (0013): the firm may set `status` and `firm_note` only, a terminal request (`completed` / `declined` / `cancelled`) is never reopened, and a resolution stamps `resolved_at` / `resolved_by` itself; **no DELETE** |
| 0008 | `insight_dismissals` | Which insights a user has checked off, keyed by rule + period | C | self SELECT/INSERT/DELETE **and** member of the business; no UPDATE (un-ticking is a delete) |
| 0014 | `notifications.payload` | Facts a notification is worded from (due date, tax type) — the bell renders the sentence in the reader's locale | — | unchanged: `notifications_self_select` |
| 0014 | `notification_dispatches` | One row per (kind, resource, milestone): a deadline is announced once however often the job runs | server-only | RLS on, **no policies** — service role only, like `rate_limits` |
| 0010 | `business_entities.timezone` | The calendar the business keeps (IANA name), firm-set | — | `assert_valid_timezone()` rejects a name Postgres cannot resolve; every "today" in the portal is resolved in it |
| 0018 | `business_entities.industry`, `.logo_url` | What the client does, and their logo in the portal chrome | — | firm-controlled: `guard_entity_firm_columns()` covers both. `logo_url` points at the public-read `logos` bucket, which only a firm admin may write |
| 0019 | `business_entities.enabled_modules` | Collapsed `statements` + `expenses` into one `bookkeeping` key — the firm sells the books as one engagement. Read only through `portalModules()` (`lib/portal/modules.ts`), which still falls back to `statements` for a row the backfill has not reached | — | unchanged: firm-controlled by the same trigger. Sales tax stays in its own `sales_tax_enabled` column |
| 0019 | `profiles.locale` | The client's portal language (`en`/`es`, null = never chosen) | C | `profiles_self_update` — the client owns it. The firm sets it when it invites them, through `raw_user_meta_data` and `handle_new_user()`; the middleware reads the same value from the JWT, never from this column |
| 0020 | `documents` DELETE | The firm portal can delete an uploaded document — the case the no-DELETE rule also blocked: a failed upload session with no way to clear it | — | `documents_admin_delete` allows a firm admin to delete an **unpublished** document; `guard_document_delete()` (BEFORE DELETE, `security definer`) refuses when any published row derives from one of its versions (`financial_reports`, `bank_statements`, `tax_obligations`, `tax_payments`, `payroll_obligations`, `reminders`) — those FKs are `ON DELETE SET NULL`, so without it a client keeps a figure whose source is gone. `documents_admin_delete_object` does the same for the bucket, or the row goes and the PDF stays |
| 0021 | `business_entities.has_dba`, `.dba_name` | Whether the business trades under a DBA, and which one — recorded rather than inferred from an empty field, because "no DBA" and "not asked yet" are different answers to a firm | — | `business_entities_dba_pair` CHECK: with a DBA there must be a non-blank name, without one there must be no name at all (a stale trade name is what ends up on a filing). Firm-controlled, so `guard_entity_firm_columns` covers both |
| 0022 | `sales_reports`, `sales_report_tenders` | Point-of-sale sales reports (Clover, Toast, Square, Stripe): what was sold, and how the money arrived. The only source of sales figures in the portal | B / A | reports: member SELECT **published only**, firm SELECT, firm admin INSERT/UPDATE; tenders via `sales_report_is_published()`. One live report per business and period (`sales_reports_period_idx`), like `bank_statements` |
| 0022 | `tax_obligations_period_idx` | One sales-tax obligation per (business, type, jurisdiction, period). The POS report fills `taxable_sales`/`tax_collected` and the filing fills `amount_payable`, so both must find the same row | — | `nulls not distinct` because `jurisdiction_id` is usually null — without it two rows with no jurisdiction would not collide, which is how one client's July obligation came to exist twice |
| 0024 | `tax_jurisdictions.tax_type` | Where a business is registered to collect sales tax — the state and the cities under it, asked when the firm turns the module on. The table existed since 0005 and nothing had ever written a row, so the client's page could only print how many its filings mentioned (always 0) | — | unchanged policies (member SELECT, firm admin write). `tax_type` because a row is a *registration*, not a place: `filing_frequency` is per tax, so Illinois-for-sales and Illinois-for-income are two rows — the unique key became `(business_entity_id, tax_type, level, code)`. `tax_jurisdictions_name_not_blank` (each name is a pill in the portal) and `tax_jurisdictions_code_shape` (`US`, `US-IL`, `US-IL-CITY-OF-NILES`), the shape 0005 wrote in a comment and nothing enforced |

## Storage buckets

| Bucket | Public | Path | Policies |
|---|---|---|---|
| `avatars` | yes (by design) | `avatars/<uid>/…` | public read; owner-folder writes |
| `documents` | **no** | `documents/{business_entity_id}/{document_id}/v{n}/{original_filename}` | SELECT: firm, or member via `document_object_is_client_visible()` (current version of a published document); INSERT: firm admin; **no UPDATE/DELETE** |
| `exports` | **no** | `exports/{business_entity_id}/{export_id}/{filename}` | SELECT: firm or entity member; writes server-side only |

Downloads never expose a bucket URL: a route handler checks membership + publication, calls `logAccess()`, and returns a signed URL with ≤ 60 s expiry.

## Helpers (`security definer`, `search_path` pinned)

| Function | Returns | Callable by | Used by |
|---|---|---|---|
| `is_entity_member(entity uuid)` | caller is a member | authenticated, service_role | every tenant SELECT |
| `is_entity_owner(entity uuid)` | caller is `client_owner` | authenticated, service_role | `entities_owner_update` |
| `shares_entity_with(target uuid)` | caller and target share a business | authenticated, service_role | `profiles_comember_select` |
| `is_firm_member()` | any firm role **and** `aal2` | authenticated, service_role | every firm SELECT |
| `is_firm_admin()` | `master_admin` **and** `aal2` | authenticated, service_role | every firm write; `guard_entity_firm_columns` |
| `report_is_published(uuid)`, `bank_statement_is_published(uuid)` | parent is published | authenticated, service_role | line / transaction SELECT |
| `document_object_is_client_visible(text)`, `object_entity_id(text)` | storage path parsing (never raise) | authenticated, service_role | storage policies |
| `claim_processing_jobs(int)` | claims runnable jobs (`FOR UPDATE SKIP LOCKED`) | **service_role only** | the worker |
| `consume_rate_limit(text, int, interval)` | under the limit? | **service_role only** | `lib/rate-limit.ts` |
| `account_requests_guard()` (trigger, before insert or update) | client INSERT: refuses firm-owned columns, sets `requested_at = now()`; client UPDATE: freezes every column but `status`, sets `resolved_at` on withdrawal | trigger | `account_requests_self_insert`, `account_requests_self_cancel` |
| `assert_valid_timezone()` (trigger) | rejects a `business_entities.timezone` Postgres cannot resolve | trigger | 0010 |
| `portal_expense_summary(...)` | every figure above the Expenses table in one grouped call; escapes its own LIKE pattern (0012) | authenticated, service_role | `lib/portal/expenses.ts` |
| `portal_expense_vendors(...)` | DISTINCT vendors for the filter facet | authenticated, service_role | `lib/portal/expenses.ts` |

EXECUTE is revoked from `public`/`anon` on every helper. Trigger functions (`handle_new_user`, `set_updated_at`, `guard_entity_firm_columns`) are executable by nobody. The `aal` claim comes from `auth.jwt() ->> 'aal'`: a firm admin who has not completed TOTP in this session is not a firm admin for RLS.

There is **no self-serve `create_organization()`**. A user who signs up has a `profiles` row and nothing else until the firm links them. The first `master_admin` is granted with `pnpm firm:admin -- <email>` (service role), never through the app.

## Three RLS archetypes (see skill `writing-rls-policies`)

- **A — server-write only.** Members read; no client write policy; the service role (jobs, `logAccess`) writes. Firm admins may correct.
- **B — members read, role-gated writes.** Every `INSERT`/`UPDATE` policy has a `WITH CHECK` mirroring `USING`. Client-visible rows are the **published** ones; the firm sees drafts.
- **C — self-only.** `profiles`, `notifications`, `notification_preferences`, `insight_dismissals`.

## Adding a table — checklist

1. Migration file `supabase/migrations/NNNN_<name>.sql` (four-digit, sequential).
2. `business_entity_id uuid not null references public.business_entities (id) on delete cascade` + index.
3. `alter table … enable row level security;` then policies one at a time, default-deny first. Firm read via `is_firm_member()`, firm writes via `is_firm_admin()`.
4. Derived records store `source`, `document_version_id`, `page_number`, `confidence`, `published_at/by`, `superseded_by` (spec §5). Client SELECT gates on publication.
5. `pnpm db:reset` → `pnpm db:types` → commit `lib/supabase/types.ts`.
6. Extend `tests/e2e/rls*.spec.ts`: user A cannot SELECT/INSERT/UPDATE/DELETE B's rows; drafts are invisible to members; a firm admin without `aal2` is blocked.
7. Update the inventory above.

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
