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
- 2026-09-02 — Vercel plan is **Pro** (owner confirmed at Checkpoint 2): per-minute cron for `/api/jobs/process-documents` and a long `maxDuration` are available — `vercel.json`, `docs/PLAN.md` §3.4.
- 2026-09-02 — The cloud Supabase project is deferred until the first Vercel deploy; Phases 2–5 are built and tested against local Supabase — `docs/ENVIRONMENTS.md`.
- 2026-09-02 — Invitations use Supabase's admin invite (service role, an identity operation) with `redirectTo=/invite`; the link is generated server-side so it comes back as an implicit-flow fragment, which the browser client does not consume by itself — `AcceptInviteForm` installs the session with `setSession()` and scrubs the fragment. The membership row itself is written through RLS as the firm admin — `lib/firm/members.ts`, `components/auth/AcceptInviteForm.tsx`.
- 2026-09-02 — Uploads: `createDocumentDraft` (rows + storage path) → browser → bucket → `finalizeDocumentUpload` (magic bytes, `pdf-lib` page count, SHA-256, duplicate by checksum per business, enqueue). A new version of a *published* document does not become current until it is published itself — `lib/documents/actions.ts`.
- 2026-09-02 — Rate limiting fails **open** on a database error (logged by code): an outage must not lock everyone out of sign-in — `lib/rate-limit.ts`.
- 2026-09-02 — Publication is strict: a document is publishable only when every extracted report/statement attached to its current version has `reconciliation.passed = true` and no line under the confidence threshold remains uncorrected; the firm cannot override, it corrects the lines instead (spec §3 "Unreconciled reports cannot be published") — `lib/documents/publish.ts`.
- 2026-09-02 — Structured output goes through `messages.create` + `output_config.format` (built with `zodOutputFormat`) and is parsed by us, not `messages.parse()`: `parse()` throws on any non-JSON text block, which would hide `stop_reason: refusal` / `max_tokens`; the library reports those as `model_refusal` / `extraction_truncated` and validates the text with the strict Zod schema before anything is used — `lib/ingestion/request.ts`.
- 2026-09-02 — `@anthropic-ai/sdk` 0.123's schema transform demotes `enum` / `const` into descriptions although the API supports both; `apiOutputFormat()` restores them on the schema sent (and drops the auto-generated constraint hints) so the grammar enforces our unions — `lib/ingestion/output-format.ts`.
- 2026-09-02 — No `thinking` parameter is sent: the models in `.env.example` (Sonnet 5 / Opus 5) run adaptive thinking by default and reject `budget_tokens`; depth is set with `output_config.effort` (`low` + 8 000 max tokens for classification and CSV mapping, `high` + 32 000 for extraction). Pointing `ANTHROPIC_FAST_MODEL` at Haiku 4.5 would need a different request shape — `lib/ai/models.ts`.
- 2026-09-02 — `lib/ai/models.ts` holds `MODELS` / `MODEL_DEFAULTS` / `modelOptions()` without `server-only` (which throws under Vitest); `lib/ai/client.ts` re-exports them beside `getAnthropic()` — `lib/ai/`.
- 2026-09-02 — One request per statement, never split: a statement group over `MAX_EXTRACTION_PAGES` (20) fails with `pdf_too_many_pages` (documented limitation; classification batches at 20 as well) — `lib/ingestion/extract.ts`.
- 2026-09-02 — Amounts from the model must already be normalised decimals (`-1234.56`, strict regex); `toCents` is lenient for CSV / firm input (thousands commas, parentheses, `$`, trailing minus) but refuses ambiguous locales such as `1.234,56` — `lib/money.ts`, `lib/ingestion/schemas/common.ts`.
- 2026-09-02 — The model may not label a tax record `firm_confirmed`: the API enum excludes it, the stored / strict enum keeps it — `lib/ingestion/schemas/tax-record.ts`.
- 2026-09-02 — Subtotal checks apply to totals inside a section (its children, else the siblings back to the previous total); top-level relationships are recognised by name (`gross_profit`, `net_income`, `balance_equation`) and unrecognised top-level totals are left unchecked. Every check also runs on the comparative column when one is present — `lib/ingestion/reconcile-statement.ts`.
- 2026-09-02 — `expectedType` only settles statement pages the classifier left ambiguous (no type, `other`, or confidence below 0.85); a confident different type is kept with a warning, so a combined P&L + Balance Sheet upload still extracts both — `lib/ingestion/pipeline.ts`.
- 2026-09-02 — Pipeline warnings carry identifiers only (page numbers, refs, types); the model's free-text `warnings[]` stay inside `data.warnings` for the review screen and never reach logs — `lib/ingestion/pipeline.ts`.
- 2026-09-02 — CSV date formats are a closed enum of eight US / ISO shapes so applying a mapping stays deterministic; any papaparse error rejects the whole file with `csv_unparseable` rather than dropping rows silently — `lib/ingestion/csv.ts`, `lib/ingestion/schemas/csv-mapping.ts`.
- 2026-09-02 — Fixture PDFs are drawn with pdf-lib under fixed metadata dates (reproducible bytes) and `tests/fixtures/expected/*.json` double as the mocked API responses; `scripts/make-fixtures.ts` is self-contained because plain Node cannot resolve the `@/` alias and rejects parameter properties — `scripts/make-fixtures.ts`.
- 2026-09-02 — Worker retry policy: a failed job goes back to `pending` with `run_after = now + 2^attempts minutes` until `max_attempts` (3), then `failed` and the document is marked `failed`; job rows store an error code only (`pdf_invalid`, `model_refusal`, `api_429`, `persist_lines`, …). Re-running a version first deletes its unpublished derived rows, so processing is idempotent — `lib/ingestion/worker.ts`, `lib/ingestion/persist.ts`.
- 2026-09-02 — Tax records: the printed jurisdiction is stored as `notes: "Jurisdiction: …"` on `tax_obligations` (no `tax_jurisdictions` row is invented — the firm assigns the jurisdiction, level and frequency in Phase 5) — `lib/ingestion/persist.ts`.
- 2026-09-02 — CSV exports land on one synthetic bank account per business (`institution = 'CSV export'`) as a `csv_export` statement in `needs_review`; the firm reassigns the account and confirms the mapping in Phase 5 — `lib/ingestion/persist.ts`.
- 2026-09-02 — The pipeline's detected type/period fill the document's blanks (a `statement_package` with exactly one extracted statement becomes that statement's type); the admin still confirms them in review — `lib/ingestion/worker.ts`.
- 2026-09-02 — Reconciliation is recomputed from the database rows after every firm correction; a corrected line counts as confident (the firm looked at it). The document is `reconciled` only when every derived record of its current version passes — `lib/documents/recompute.ts`.
- 2026-09-02 — Integration tests run the real worker against local Supabase with the Messages API mocked by msw; the mock recognises fixtures by hashing the single-page PDFs the pipeline sends, so no test-only hook exists in app code — `tests/integration/worker.test.ts`.
- 2026-09-02 — (supersedes the "one request per statement, never split" entry above) Requests stay non-streaming with an explicit 240 s per-request timeout (`REQUEST_TIMEOUT_MS`) and the reasoning role asks for 16 000 output tokens, so one extraction fits the worker's 300 s function budget; a `max_tokens` stop is still `extraction_truncated`. A statement group longer than `EXTRACTION_CHUNK_PAGES` (10) is extracted chunk by chunk and merged: refs are offset per chunk, parents stay within their chunk, the header (and for bank statements both summary balances) comes from the first chunk. A section straddling a chunk boundary fails its subtotal check and goes to review rather than being stitched. Tax records are never chunked (`TAX_RECORD_MAX_PAGES` = 20, else `pdf_too_many_pages`) — `lib/ingestion/request.ts`, `lib/ingestion/extract.ts`, `lib/ai/models.ts`.
- 2026-09-02 — The SDK's default `maxRetries` (2) also retries timeouts, so a hung request could take 3 × 240 s; the worker should construct its client with `maxRetries` tuned to its budget — `lib/ai/client.ts` (open question for the worker author).
