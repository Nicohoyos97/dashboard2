# Assumptions & reuse decisions

`INITIAL_PROMPT.md` §0/§1 ask for every assumption and every reuse decision to be recorded here. Keep it current: one dated entry per decision, newest at the bottom of each section.

## Bootstrap from v1 (2026-09-02)

This repository was created by copying **Hoyos-Baker-Dashboard v1** at commit `7d32144` and stripping everything QuickBooks-specific. The v1 repo stays on GitHub as an archive; its cloud Supabase project (`dzuipbehfiamnqmwwjzm`) is not reused.

### Kept (and why)

| What | Why |
|---|---|
| Auth: email/password, **Google OAuth** sign-up/sign-in, reset, email confirmation, `/callback` | Working, tested, and explicitly required by the owner. The spec's "Auth (email + TOTP MFA)" is read as *additive* — TOTP is for firm admins. |
| **Profile photo upload** (`avatars` bucket, `ProfileForm`) | Explicitly required by the owner. Public-read bucket is a documented design choice. |
| Tenancy core: `profiles`, businesses, memberships, RLS helpers, function hardening | Exactly the foundation §5 asks for; rewriting it would add risk, not value. |
| `chat_sessions` / `chat_messages` / `audit_logs` | Match §5 by name after renaming; extended (not recreated) in Phase 4. |
| `lib/auth`, `lib/supabase`, `lib/audit`, `middleware.ts`, next-intl setup, shadcn primitives, auth components, settings pages | Preserved conventions; see `CLAUDE.md` §3. |
| Two project skills (`multi-tenant-data-access`, `writing-rls-policies`) | Rewritten to the v2 vocabulary. They win over the prompt on conflict. |

### Renamed (v1 → v2, per §5)

`organizations → business_entities`, `organization_id → business_entity_id`, `organization_members → entity_memberships`, `is_member_of → is_entity_member`, `is_admin_of → is_entity_owner`, `shares_org_with → shares_entity_with`, `chat_conversations → chat_sessions` (`conversation_id → session_id`), `audit_log → audit_logs`, roles `owner/admin/member/viewer → client_owner/client_viewer`. Code: `getCurrentOrg → getCurrentEntity`, `requireOrg → requireEntity`, `updateOrganization → updateBusinessEntity`, route `/settings/organization → /settings/business`.

### Changed semantics

- **No self-serve business creation.** v1 auto-created "My Workspace" on first login (`create_organization()` RPC + `ensureOrgForCurrentUser`). Removed: businesses are firm-provisioned (§8). A self-signed-up user sees a pending state on the Overview until the firm links them by email.
- **`business_entities.created_by`** is nullable with `ON DELETE SET NULL` (was `NOT NULL … CASCADE`): the creator is a firm admin and deleting that account must never delete client data.
- **No client DELETE on businesses.** v1 let owners delete their org. The firm retires businesses.
- **`audit_logs` has no client read** (v1: owner/admin could read). Firm admins read it via `is_firm_admin()` (Phase 1).
- **`client_owner` may still edit the business profile** (name / legal name / address). Kept because the owner explicitly wants "company profiles"; the firm can tighten this in Phase 1 if it prefers firm-only edits.
- The **Overview route stays `/dashboard`** (auth redirects and e2e tests depend on it); the nav label is "Overview".

### Dropped

`lib/quickbooks/*`, `app/api/quickbooks/*`, the connections settings page, v1 migrations `0003` (QB connections) and `0008–0010` (Vault token accessors), `reports_cache` (QB-shaped; §5 defines `financial_reports` instead), QB-fed dashboard/report components and their 8 unit tests, the `quickbooks-integration` skill, `docs/QUICKBOOKS.md`, `docs/ROADMAP.md`, `docs/ARCHITECTURE.md` (superseded by `docs/PLAN.md`), `docs/DESIGN_SYSTEM.md` and `design-references/` (superseded by §6 — the v1 palette `#003ec7` / Manrope / Plus Jakarta Sans is gone; tokens now follow §6 with Inter).

### Environment

- `.env.local` reuses the v1 `ANTHROPIC_API_KEY` and Google OAuth client; adds `APP_URL`, `ANTHROPIC_FAST_MODEL`, `ANTHROPIC_REASONING_MODEL`. Supabase values point at the **local** Docker instance (`project_id = dashboard2`).
- The cloud Supabase project for 2.0 does not exist yet; creation steps are in `docs/ENVIRONMENTS.md`.
- Model IDs in `.env.local` are placeholders to be verified against the Anthropic docs before Phase 4 (§1.2).

## Running assumptions (Phase 0+)

_Add entries as `- YYYY-MM-DD — <assumption> — <why> — <where it applies>`._

- 2026-09-02 — Model IDs verified against the live models overview: `claude-opus-5`, `claude-sonnet-5`, `claude-haiku-4-5-20251001` (alias `claude-haiku-4-5`). Recommended for 2.0: reasoning `claude-opus-5`, fast `claude-sonnet-5` (Haiku 4.5 retirement window opens 2026-10-15; 100-page PDF cap on 200K-context models). `.env.local` keeps its current values until Checkpoint 1 decides — `docs/PLAN.md` §9.1–9.2 — env config + `lib/ai/client.ts`.
- 2026-09-02 — Never use the Anthropic Files API — its docs state files are workspace-scoped, not tenant-scoped, and recommend a workspace per tenant for multi-tenant apps. PDFs go per request as base64, split per page with `pdf-lib` so every request stays far under 32 MB / 600 pages — `lib/ingestion/`.
- 2026-09-02 — Structured output via `output_config.format` + `client.messages.parse()` with `zodOutputFormat`, not a forced tool call (spec §9 wording) — same schema guarantee; forced `tool_choice` is rejected on the newest models and model IDs are configuration. API-facing Zod schemas carry no `min/max/minLength/maxLength` (unsupported by the API); a strict Zod schema re-validates before any insert — `lib/ingestion/schemas/`, `lib/ai/router.ts`.
- 2026-09-02 — `pdf-lib` only for page count + per-page splitting; `pdfjs-dist` deferred until a text-layer need (scanned-PDF detection) is proven — `lib/ingestion/pdf.ts`.
- 2026-09-02 — Job runner = DB queue + `GET /api/jobs/process-documents` (Bearer `CRON_SECRET`) on Vercel Cron, dev-only in-process trigger in the admin UI; steps persisted so timeouts resume. Supabase Edge Function + pg_cron rejected (second runtime, duplicated schemas) — `lib/ingestion/worker.ts`, `vercel.json`.
- 2026-09-02 — Admin uploads go browser → private `documents` bucket with the RLS-scoped browser client (firm-admin storage policy), then a Server Action finalizes (magic bytes, SHA-256, page count, dedupe, enqueue). Relaying bytes through the server is blocked by Vercel's ~4.5 MB body cap — `lib/documents/actions.ts`.
- 2026-09-02 — Rate limiting = Postgres fixed-window counters via `consume_rate_limit()`; no Redis vendor — `lib/rate-limit.ts`.
- 2026-09-02 — No malware scanner in the stack: validate size + MIME + file signature and record the limitation in `docs/DELIVERY.md` (spec §3 allows it).
- 2026-09-02 — Money: `numeric(18,2)` in Postgres, integer cents in TypeScript; reconciliation tolerance $1.00 per subtotal; confidence threshold 0.85 → `needs_review`. Both are named constants — `lib/money.ts`, `lib/ingestion/reconcile.ts`.
- 2026-09-02 — Firm roles: `is_firm_member()` (any firm role + `aal2`) gates every firm SELECT; `is_firm_admin()` (`master_admin` + `aal2`) gates writes. `firm_staff` is scaffolded read-only — migration `0002_firm.sql`.
- 2026-09-02 — Client-visible rows are published rows only, enforced in RLS (`published_at is not null` on the member branch), not just in the UI — migrations `0003`–`0005`.
- 2026-09-02 — Nick citations: tool results carry citation ids, the model writes `[cN]` markers, the server resolves them to `chat_citations`; a numeric answer with no marker is rejected and retried once. Streaming goes through `app/api/chat` (route handler) because Server Actions cannot stream — `lib/ai/chat.ts`.
- 2026-09-02 — Firm-internal notes live in `entity_firm_notes` (firm-only RLS), not in a `business_entities.firm_notes` column: RLS is row-level, so any column on the entity table is readable by the client — migration `0002_firm.sql`.
- 2026-09-02 — `client_owner` keeps its UPDATE policy on `business_entities`, but the `guard_entity_firm_columns` trigger rejects client changes to firm-controlled columns (`client_id`, fiscal/basis/currency, `sales_tax_enabled`, `enabled_modules`, `status`) — migration `0002_firm.sql`.
- 2026-09-02 — The firm has **no read path** on `chat_sessions`, `chat_messages` or `chat_citations`: conversations with Nick are private to the client; the firm's "Nick usage" reads `ai_usage_daily` aggregates only — migrations `0002`, `0005`.
- 2026-09-02 — Added `bank_statements` (not in the spec's §5 list) so every bank transaction hangs off a statement that carries period, beginning/ending balance, publication and reconciliation; CSV exports get `kind = 'csv_export'` — migration `0004_financials.sql`.
- 2026-09-02 — Added a private `exports` bucket for CSV/PDF exports (`exports/{entity}/{export_id}/{filename}`) instead of mixing exports into `documents` — migration `0005_tax_reminders.sql`.
- 2026-09-02 — Supabase CLI upgraded to v2.116 (`config.toml`: `[inbucket]` → `[local_smtp]`); the local mail catcher is now Mailpit at `http://127.0.0.1:54324` — `tests/e2e/auth.spec.ts`, `docs/ENVIRONMENTS.md`.
- 2026-09-02 — The first `master_admin` is granted with `pnpm firm:admin -- <email>` (service role, `scripts/bootstrap-firm-admin.ts`); the app never self-provisions firm roles. Further staff are added by a master admin (Phase 2 UI).
