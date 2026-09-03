# Dashboard 2.0 — Implementation plan (Phase 0 deliverable)

> Written 2026-09-02 at the end of Phase 0 (`INITIAL_PROMPT.md` §12). **Status 2026-09-02:** Checkpoint 1 approved with every §9 recommendation; Phase 1 delivered (see `CLAUDE.md` §8, `docs/DATABASE.md`). **Status 2026-09-03:** Phases 2–4 delivered; §3.7 is implemented under `lib/ai/nick/` (the loop is manual and streaming, the router uses `output_config.format`, sensitive tools gate on a router-confirmed pending action) — details in `docs/ASSUMPTIONS.md` (2026-09-03 entries). Sources: the repo as bootstrapped (`docs/ASSUMPTIONS.md`), the spec, and the Anthropic docs fetched today (models overview, PDF support, structured outputs, Files API). **Checkpoint 1:** this plan needs approval before Phase 1 starts; the open decisions are in §9.

---

## 1. Where the repo stands

| Area | State | Verified how |
|---|---|---|
| Auth (email + Google, reset, confirm), profile photo, settings, i18n, app shell | Working, preserved from v1 | `pnpm typecheck`, `pnpm lint`, `pnpm test` (9/9) pass; e2e specs exist for auth, business permissions, RLS |
| Baseline schema `0001_baseline.sql` | `profiles`, `business_entities`, `entity_memberships`, `chat_sessions`, `chat_messages`, `audit_logs`, `avatars` bucket, 3 RLS helpers, function hardening | Local Supabase (`dashboard2`) is running and migrated |
| Design tokens (§6) | In `app/globals.css` + guarded by a unit test | — |
| Nav | `lib/nav.ts` lists §7 items; unbuilt ones render disabled | unit test |
| `lib/ai/*` | Empty stubs | — |
| Cloud Supabase project for 2.0 | **Does not exist yet** | `docs/ENVIRONMENTS.md` |
| Supabase CLI | v1.226 installed locally (devDependency `^1.200`), v2.116 current | `npx supabase status` |
| New deps needed | `@anthropic-ai/sdk` 0.123, `pdf-lib` 1.17, `papaparse` 5.7 (+ types), `@axe-core/playwright` 4.13 | `npm view` |

Nothing from v1 needs to be re-implemented. Everything below extends the baseline.

---

## 2. What the Anthropic docs say today (2026-09-02)

These facts drive the ingestion and Nick designs. They came from the live docs, not memory (§1.2).

**Models** (Claude API IDs are pinned snapshots; no date suffix is needed for the 4.6+ generation):

| Model | ID | Context / max out | Price in/out per MTok | Notes |
|---|---|---|---|---|
| Claude Opus 5 | `claude-opus-5` | 1M / 128K | $5 / $25 | Adaptive thinking on by default; `output_config.effort`; retirement not before 2027-07-24 |
| Claude Sonnet 5 | `claude-sonnet-5` | 1M / 128K | $2 / $10 | Adaptive thinking; `effort`; retirement not before 2027-06-30 |
| Claude Haiku 4.5 | `claude-haiku-4-5-20251001` (alias `claude-haiku-4-5`) | 200K / 64K | $1 / $5 | Extended thinking only (`budget_tokens`), no `effort`; **retirement not before 2026-10-15** |

**PDF input** (no beta header, all active models): send `{type:'document', source:{type:'base64', media_type:'application/pdf', data}}`. Limits are on the whole request: **32 MB**, **600 pages** (**100 pages when the model's context window is under 1M**, i.e. Haiku 4.5). Every page is processed as text **and** as an image: ~1,500–3,000 text tokens per page plus image tokens. Dense pages can exhaust context before the page limit, so the docs recommend splitting.

**Structured outputs** (GA, no beta header): `output_config.format = {type:'json_schema', schema}`; TypeScript helper `client.messages.parse({... output_config:{format: zodOutputFormat(schema)}})` → `parsed_output`. Supported on Opus 5, Sonnet 5, Haiku 4.5 (dated ID). Schema constraints: `additionalProperties:false` + `required`; **`minimum`/`maximum`/`minLength`/`maxLength`, recursive schemas and external `$ref` are not supported**. Strict tool use is `strict:true` on the tool definition. Forced `tool_choice` (`any`/`tool`) is **rejected on the newest models** (Fable 5.1). Document citations are incompatible with `output_config.format`.

**Files API** (GA): files are **workspace-scoped, not tenant-scoped** — the docs explicitly say a multi-tenant app must use one workspace per tenant. Files persist until deleted or until `expires_at` (min 1 h). Conclusion: we never use it (matches §3): PDFs go per request as base64, split per page so every request stays small.

**Refusals**: Opus/Sonnet 5 can return `stop_reason:'refusal'` with `stop_details`. Financial statements should never trigger it, but the worker treats it as `needs_review` with error code `model_refusal`.

---

## 3. Architecture

```
Browser (client portal / admin portal)
   │  Server Components + Server Actions (RLS-scoped Supabase client, user session)
   ▼
Next.js 15 App Router on Vercel
   ├─ app/[locale]/(dashboard)/…   client portal (existing shell, extended)
   ├─ app/[locale]/admin/…         firm portal (new shell; layout requires firm role + aal2)
   ├─ app/api/documents/[versionId]/download   signed URL ≤ 60 s + audit
   ├─ app/api/jobs/process-documents           worker, CRON_SECRET, Vercel Cron
   └─ app/api/chat                             Nick streaming (route handler, SSE)
   │
   ├─ Supabase Postgres (RLS)  ──  Supabase Storage: `documents` (private), `avatars` (public)
   └─ Anthropic API (server only): FAST model = classify/route, REASONING model = extract/answer
```

Principles already in `CLAUDE.md` §2 apply unchanged. Two additions:

1. **Two request paths, never mixed.** User-facing code (both portals) uses `createClient()` with the user's session; firm admins get through RLS via `is_firm_member()` / `is_firm_admin()`. Only the worker (`/api/jobs/*`) and `logAccess()` use `createAdminClient()`, and every worker query names its `business_entity_id`.
2. **Money is integer cents in TypeScript, `numeric(18,2)` in Postgres.** All totals, variances and reconciliation run in TS/SQL on cents (§3 financial integrity). The model only ever emits what it read.

### 3.1 Entity switcher
`getCurrentEntity()` gains a cookie (`hb_entity`, httpOnly) that is honored only if the user has a membership for it; otherwise it falls back to the earliest-joined membership (current behaviour). A Server Action `switchEntity(id)` validates membership and sets the cookie. Firm admins in the client portal preview use the same cookie (`previewAs`).

### 3.2 Firm admin gate
- `app/[locale]/admin/layout.tsx`: `getCurrentUser()` → `firm_memberships` row → `supabase.auth.mfa.getAuthenticatorAssuranceLevel()` must be `aal2`, else redirect to `/admin/mfa` (enroll or challenge with TOTP, browser client, mirrors the avatar-upload pattern of client-side Supabase use).
- Middleware keeps `/admin` in `PROTECTED_PREFIXES` (already there); the layout does the role + MFA check server-side; the DB does it again inside `is_firm_admin()` via `auth.jwt() ->> 'aal'`.

### 3.3 Uploads (admin)
Vercel caps request bodies at ~4.5 MB and Server Actions default to 1 MB, while bank statements run 5–20 MB. So:
1. Server Action `createDocumentDraft({clientId, entityId, filename, size, mime})` → Zod → inserts `documents` + `document_versions` (status `uploading`) and returns the storage path `documents/{entity}/{doc}/v{n}/{filename}`.
2. The browser uploads straight to Storage with the RLS-scoped browser client (policy `documents_firm_insert` → `is_firm_admin()`), exactly like avatars today.
3. Server Action `finalizeDocumentUpload(versionId)` downloads the object with the admin's RLS-scoped session, checks `%PDF-` magic bytes / CSV heuristics, computes SHA-256, page count (`pdf-lib`), rejects duplicates by checksum, sets status `uploaded`, and enqueues a `document_processing_jobs` row.

Bytes are immutable; a replacement is a new `document_versions` row (`supersedes_version_id`).

### 3.4 Job runner (decision → §9.4)
- Queue: `document_processing_jobs (status pending|running|succeeded|failed, attempts, max_attempts=3, error_code, locked_at, business_entity_id, document_version_id, step)`.
- Claim: SQL function `claim_processing_jobs(n)` — `UPDATE … WHERE status='pending' … FOR UPDATE SKIP LOCKED`, service role only. Stale `running` rows (locked_at older than 10 min) are re-queued.
- Runner: `GET /api/jobs/process-documents` protected by `Authorization: Bearer $CRON_SECRET`, `maxDuration` set to the Vercel plan's maximum, invoked by Vercel Cron (`vercel.json`, every minute — needs Vercel Pro; Hobby crons run daily). Dev: an admin-UI button (rendered only when `NODE_ENV !== 'production'`) calls the same `runPendingJobs()` function in-process.
- Steps are persisted so a timeout resumes instead of restarting: `split` → `classify` (writes `document_pages`) → `extract` (writes `financial_reports` + lines, or bank/tax tables) → `reconcile` → `done` (`needs_review` or `reconciled`).
- Rejected alternative: Supabase Edge Function + pg_cron. It would duplicate the Zod schemas, pdf handling and Anthropic client in a second runtime.

### 3.5 Ingestion pipeline (`lib/ingestion/`)
```
pdf.ts        pdf-lib: page count, split into single-page PDFs (Buffer), size guard
classify.ts   FAST model, batches of ≤ 20 one-page document blocks titled "Page N"
              → { pages: [{ page, kind: firm_letter|financial_statement|notes|other,
                             report_type?, period_start?, period_end?, confidence }] }
extract.ts    REASONING model, only financial_statement pages (each page its own block, title "Page N")
              → FinancialStatement | BankActivity | TaxRecord (Zod), max_tokens 32K,
                stop_reason=max_tokens ⇒ error_code extraction_truncated ⇒ needs_review
schemas/      *ApiSchema (no min/max/length keywords — API constraint) and *Schema (strict,
              refinements, used before any insert). page ∈ pages actually sent, else needs_review
hierarchy.ts  builds parent_line_id/depth/is_section/is_total from section + parent_ref
reconcile.ts  deterministic checks (§9 of the spec) on integer cents
csv.ts        papaparse; FAST model proposes a column mapping; admin confirms; dedupe key
              (date, amount, normalized description, account)
worker.ts     runPendingJobs(): claim → steps → persist; never throws content into errors
```
Prompt hygiene: every document block is declared untrusted data in the system prompt; the extraction prompt is snapshot-tested; nothing from the model is inserted without passing the strict Zod schema.

Why `output_config.format` instead of "tool-use forced call" (spec §9 wording): same schema guarantee, one fewer moving part (`parse()` validates and types the result), and forced `tool_choice` is rejected on the newest models — model IDs are configuration, so we do not want a mechanism that breaks when the env var changes. Recorded in `docs/ASSUMPTIONS.md`.

### 3.6 Reports for the client portal (`lib/reports/`)
Server-side read models over published rows only: `pnl.ts`, `balance-sheet.ts`, `overview.ts`, `variance.ts` (current vs prior in cents and %), `granularity.ts` (which of month/quarter/year the sources support — disabled otherwise, never synthesized), `insights/rules.ts` (deterministic rule set; Nick may phrase, the rule decides). Every figure carries `{ value_cents, source, period, document_version_id, page, confidence }`.

### 3.7 Nick (`lib/ai/`)
- `client.ts` (Anthropic client, model IDs from env, `max_tokens` per role, adaptive thinking + `effort` on 5-series models, `budget_tokens` only if a pre-4.6 model is configured).
- `router.ts`: FAST model, `parse()` → `{ complexity, tools_likely }`.
- `tools.ts`: the 11 read-only tools of spec §10 as `strict:true` tool definitions with Zod input schemas; handlers close over `entity.id`, page context and period from the session. No tool schema has a tenant id.
- `chat.ts`: manual loop (`stop_reason === 'tool_use'`), ≤ 8 tool iterations, streams the final text over SSE from `app/api/chat/route.ts` (a route handler is used because Server Actions cannot stream; it still performs no mutation on behalf of the client except persisting the thread, which is the chat itself).
- Citations: tool results carry citation ids; the model writes `[c1]` markers; the server resolves them into `chat_citations` rows and chips. A final text containing a number pattern and no marker is rejected server-side and retried once with a corrective message.
- Sensitive tools (`get_report_download_link`, `create_financial_export`) require a confirmation turn: the tool returns `{ requires_confirmation: true }` and the real link is issued only after the user's explicit yes.
- Cost controls: `ai_usage_daily(business_entity_id, day, input_tokens, output_tokens)` + per-user message rate limit + iteration cap.

### 3.8 Rate limiting (decision → §9.5)
Postgres fixed-window counters via `consume_rate_limit(key text, max int, window interval)` (security definer, `service_role` + `authenticated`), called from the auth actions, upload/download handlers and chat. No new vendor.

---

## 4. Schema (Phase 1 migrations; SQL shown for review before it is applied)

All tenant tables: `business_entity_id uuid not null references business_entities on delete cascade`, RLS on, index on `(business_entity_id, …)`. Derived rows carry `source ('firm_document'|'firm_entry')`, `document_version_id`, `page_number`, `confidence numeric(4,3)`, `published_at`, `published_by`, `superseded_by`. Money: `numeric(18,2)`.

| Migration | Tables / objects | Archetype |
|---|---|---|
| `0002_firm.sql` | `firms`; `firm_memberships (firm_id, user_id, role master_admin|firm_staff)`; `clients (firm_id, name, contact_name, contact_email, notes)`; `business_entities` + `client_id`, `fiscal_year_start_month`, `accounting_basis (cash|accrual)`, `currency`, `sales_tax_enabled`, `enabled_modules jsonb`, `firm_notes`, `status`; helpers `is_firm_member()` (any firm role + aal2) and `is_firm_admin()` (master_admin + aal2); every existing SELECT policy becomes `… OR is_firm_member()`; firm-admin INSERT/UPDATE on `business_entities`, `entity_memberships`, `clients`; `audit_logs` firm read | B / helpers |
| `0003_documents.sql` | `documents (type, status, client-visible title)`; `document_versions (version_no, storage_path, sha256, size_bytes, mime, page_count, original_filename, uploaded_by, supersedes_version_id)`; `document_pages (page_number, kind, report_type, period, confidence)`; `document_processing_jobs`; bucket `documents` (private) + storage policies; `claim_processing_jobs()` | A (pages, jobs) / B (documents, versions: firm write) |
| `0004_financials.sql` | `financial_periods`; `financial_reports (report_type pnl|balance_sheet, basis, period, status uploaded…superseded, reconciliation jsonb)`; `financial_statement_lines (parent_line_id, depth, is_section, is_total, account_name, account_number, current, prior, page, source_text)`; `bank_accounts (institution, masked_number)`; `bank_transactions (date, posting_date, description, debit, credit, running_balance, category_id)`; `expense_categories` | A (lines, transactions) / B (reports, accounts, categories) |
| `0005_tax_reminders.sql` | `tax_jurisdictions`; `tax_obligations (tax_type income|sales|payroll, status estimated|firm_confirmed|paid|payable|pending_review)`; `tax_payments`; `payroll_obligations`; `reminders (type, status, due_date, amount, responsible, action_required)`; `insights`; `notifications`; `generated_exports`; `chat_citations`; `chat_messages` + `tool_calls jsonb`; `ai_usage_daily`; `rate_limits` + `consume_rate_limit()` | B (firm-entered) / A (insights, citations, exports) |

Role matrix:

| Role | Where | Reads | Writes |
|---|---|---|---|
| `master_admin` | `firm_memberships` | everything (`is_firm_member`) | firm config, documents, reports, reminders, publish (`is_firm_admin`) |
| `firm_staff` | `firm_memberships` | everything, read-only dashboards | none (scaffolded, gated, no UI beyond read) |
| `client_owner` | `entity_memberships` | own entities, published rows only | business profile (existing policy), own chat sessions |
| `client_viewer` | `entity_memberships` | own entities, published rows only | own chat sessions |

"Published rows only" is enforced in RLS, not in the UI: client SELECT policies on `financial_reports`, `financial_statement_lines`, `documents`, `document_versions`, `tax_*`, `reminders` add `and published_at is not null` (or `status = 'published'`) to the member branch; the firm branch sees drafts.

RLS tests (`tests/e2e/rls.spec.ts`) grow per migration: two clients × two entities × one firm admin; every verb on every table; storage signed-URL cross-tenant; firm admin without `aal2` blocked from tables and `/admin`.

---

## 5. Routes and files to add

```
app/[locale]/admin/
  layout.tsx · page.tsx (dashboard) · mfa/ · clients/ · clients/[id]/ · entities/[id]/
  upload/ · documents/ (queue) · documents/[id]/ (review · reconcile · publish · versions)
  audit/ · settings/
app/[locale]/(dashboard)/
  statements/profit-and-loss · statements/balance-sheet · expenses · taxes/income · taxes/sales
  reports/ (library) · chat/ · help/ · settings/notifications
app/api/documents/[versionId]/download/route.ts
app/api/jobs/process-documents/route.ts
app/api/chat/route.ts
lib/firm/actions.ts · lib/documents/actions.ts · lib/reports/* · lib/ingestion/* · lib/ai/*
lib/insights/rules.ts · lib/rate-limit.ts · lib/money.ts
components/admin/* · components/statements/* (StatementTable, LineDrawer) · components/charts/* · components/chat/*
supabase/migrations/0002–0005 · supabase/seed.sql (Demo-labeled, Phase 6)
vercel.json (cron)
```

Nav: `lib/nav.ts` items flip from `disabled` to live as each page ships; Sales Taxes becomes visibility-gated by `sales_tax_enabled`. A second `ADMIN_NAV_ITEMS` list feeds the admin sidebar. Both shells share one responsive `AppShell` (sidebar → drawer under `md`).

---

## 6. Phase plan and checkpoints

| Phase | Scope | Exit criteria |
|---|---|---|
| **1 — Foundations** | Migrations 0002–0005, helpers, storage bucket, RLS tests, MFA gate for `/admin`, entity switcher, env (`CRON_SECRET`), both app shells restyled to §6, deps added | **Checkpoint 2:** migrations reviewed + RLS suite green. Last stop. |
| 2 — Admin + ingestion | Client/entity CRUD, invite + link by email, uploader, pipeline, review queue, corrections, reconcile, publish/supersede/unpublish, audit views, dev job trigger | §14 items 1–5, 17–19 in browser + integration tests on fixture PDFs (Anthropic mocked at HTTP layer; one live test behind `ANTHROPIC_LIVE_TESTS=1`) |
| 3 — Client core | Overview, P&L, Balance Sheet (table + drawer + charts + CSV/print), reports library, download route, reminders | §14 items 6–9, 12–13, 16, 20 |
| 4 — Nick | Client, router, tools, citations, contextual panels, full-page chat, exports, cost controls | §14 items 10–11 |
| 5 — Remaining modules | Expenses, Income Taxes, Sales Taxes, notifications, settings/profile/help, export + deletion requests, optional client MFA | §14 items 14–15 |
| 6 — Hardening | Demo seed, axe on every primary page, mobile pass, security headers, full suite, `docs/DELIVERY.md` | §14 items 21–22, everything green |

Commit after each phase. Phases 0–3 are the MVP that ships first; Phase 4 does not start before §14 items 1–9 pass.

---

## 7. Testing strategy

- **Unit (Vitest):** `money`, `reconcile`, `hierarchy`, `variance`, `granularity`, source-label rules, insight rules, router schema, every Zod schema (valid + adversarial input), citation-marker validator.
- **Integration:** worker on fixtures in `tests/fixtures/` — combined letter + P&L, Balance Sheet (balanced and unbalanced), bank statement, sales-tax confirmation, CSV — with the Anthropic HTTP layer mocked via `msw`; system prompts snapshot-tested.
- **RLS (Playwright, service-role fixtures):** extended per migration as in §4.
- **E2E (Playwright, desktop + mobile projects):** the §14 workflow end to end; `@axe-core/playwright` on every primary page.
- Gates before every push: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`.

---

## 8. Assumptions made in Phase 0

Recorded in `docs/ASSUMPTIONS.md` (dated entries). Summary: no Files API ever; `pdf-lib` only (no `pdfjs-dist`) until a text-layer need appears; structured output via `output_config.format`; Vercel Cron + route handler as the job runner; Postgres-backed rate limiting; direct-to-Storage uploads; no malware scanner available → documented limitation with magic-byte + MIME + size validation; reconciliation tolerance $1.00 per subtotal and confidence threshold 0.85 (both constants, both configurable); `firm_staff` = read-only via `is_firm_member()`; `client_owner` keeps editing the business profile.

---

## 9. Open decisions (recommendation first)

1. **Reasoning model.** Recommend `ANTHROPIC_REASONING_MODEL=claude-opus-5` (extraction accuracy on financial statements is worth $5/$25 at firm-upload volumes; Nick stays under per-entity budgets). `.env.local` currently has `claude-sonnet-5`, which is acceptable if cost is the priority.
2. **Fast model.** Recommend `ANTHROPIC_FAST_MODEL=claude-sonnet-5` with `effort: 'low'` instead of the current `claude-haiku-4-5-20251001`: Haiku 4.5's retirement window opens 2026-10-15, it caps PDF requests at 100 pages, and it lacks the `effort` API the rest of the code will use. Page classification is cheap either way.
3. **Structured output mechanism.** `output_config.format` + `messages.parse()` (recommended) vs the spec's forced tool call. Same guarantee; the forced form is rejected on the newest models.
4. **Job runner.** Vercel Cron + protected route handler (recommended) — requires **Vercel Pro** for per-minute cron and a longer `maxDuration`. Alternative: Supabase Edge Function + `pg_cron` (second runtime, duplicated code). Please confirm the Vercel plan.
5. **Rate-limit store.** Postgres RPC (recommended, no new vendor) vs Upstash Redis.
6. **Upload path.** Browser → Storage with RLS + server-side finalize (recommended) vs relaying bytes through the server (blocked by the 4.5 MB body cap).
7. **Supabase CLI upgrade.** Move `supabase` devDependency from v1.226 to v2.x at the start of Phase 1, before new migrations, and re-check `config.toml`. Recommended.
8. **Cloud project.** Create the 2.0 Supabase project (`docs/ENVIRONMENTS.md`) during Phase 1 so Checkpoint 2 can also show `db push` output — needs your Supabase account; nothing in Phase 1 blocks on it.
9. **Malware scanning.** No scanner is available in the stack; ship with signature/MIME/size validation and record the limitation in `docs/DELIVERY.md` (allowed by §3). Confirm.
10. **Firm-only edits of the business profile.** Keep `client_owner` editing name/legal name/address (current behaviour) unless the firm prefers firm-only.
