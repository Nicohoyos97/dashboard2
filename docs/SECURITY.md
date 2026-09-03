# Security

This is a financial application handling client books, bank statements and tax documents. A single tenant-isolation bug exposes another business's finances. Read this before writing code that touches auth, documents, queries, AI, or logs. `INITIAL_PROMPT.md` §3 is the normative list; this doc explains how the repo satisfies it.

---

## Threat model — what we defend against

1. **Tenant isolation breach** — user A sees business B's statements, documents, conversations.
2. **Document exfiltration** — a public bucket, a long-lived signed URL, an Anthropic file ID reused across tenants.
3. **Account takeover** — weak password, missing MFA on firm admins, session hijacking, OAuth callback CSRF.
4. **Privilege escalation** — `client_viewer` acting as `client_owner`; a client reaching `/admin`.
5. **Prompt injection** — instructions hidden inside an uploaded PDF or a tool result steering Nick.
6. **Fabricated numbers** — the model inventing or mis-summing figures.
7. **Supply chain / SSRF / logging leaks** — as in any web app.

---

## Controls

### Authentication

- Supabase Auth: email/password **and Google OAuth** (preserved from v1 — `signInWithGoogle` in `lib/auth/actions.ts`). Email verification required before sign-in. Forgot-password links expire in 1 hour.
- Sessions in `SameSite=Lax`, `Secure` (production) cookies via `@supabase/ssr` (`lib/supabase/env.ts` → `COOKIE_OPTIONS`). Session refresh + route guard in `middleware.ts` / `lib/supabase/middleware.ts`.
- **Cookies are not `HttpOnly`** — a conscious trade-off required by the `@supabase/ssr` model (browser client reads the session). Mitigated by `SameSite=Lax`, `Secure`, 1 h access tokens with rotation, and the CSP below.
- Password rules enforced client- and server-side (`lib/auth/schemas.ts`). Error messages never differentiate wrong-password from unknown-email (enumeration).
- **MFA (TOTP, `aal2`) is required for every firm route and inside `is_firm_member()` / `is_firm_admin()`.** `app/[locale]/admin/layout.tsx` checks the firm membership, `admin/(gated)/layout.tsx` requires `aal2` (else `/admin/mfa`, where `MfaGate` enrolls or verifies TOTP through the browser client), and the DB helpers read `auth.jwt() ->> 'aal'` so an aal1 session is not a firm session for RLS. TOTP is enabled in `supabase/config.toml` (`[auth.mfa.totp]`); enable it in the cloud dashboard too. Optional for clients (Phase 5).
- Rate limiting: Postgres fixed-window counters (`rate_limits` + `consume_rate_limit()`, service-role only, `lib/rate-limit.ts`). Keys are composed server-side (`signin:<ip>`, `chat:<user>`, …). Wired to document upload (`upload:<user>`) and download (`download:<user>`); auth and chat follow with their endpoints.

### Authorization

- **RLS is the primary control.** Every tenant table filters by `business_entity_id` via `is_entity_member()`; firm access goes through `is_entity_member(...) OR is_firm_admin()`. See `docs/DATABASE.md`.
- App-level checks (`requireEntity`, role checks in Server Actions) are additional defense, never a substitute.
- Client roles: `client_owner` (edit business profile, full read) > `client_viewer` (read). Firm roles (`master_admin`, `firm_staff`) live in `firm_memberships` (Phase 1).
- **Service-role client (`lib/supabase/admin.ts`) bypasses RLS.** Use it only for system writes with no client policy (`logAccess`, jobs that name their tenant, server-maintained counters). Never inside a request handler to read or write tenant data on a user's behalf.
- `audit_logs` has **no client read path** (default deny); the firm reads it via `is_firm_member()`. Conversations with Nick (`chat_*`, `chat_citations`) have **no firm read path** — the firm sees `ai_usage_daily` aggregates only.

### Documents & storage

- Every document bucket is **private**; only `avatars` is public-read (low sensitivity, members list).
- Path layout `documents/{business_entity_id}/{document_id}/v{n}/{original_filename}`; storage RLS mirrors table RLS. Bytes are immutable; replacements are new versions.
- Downloads go through `app/api/documents/[versionId]/download`: the RLS-scoped client decides visibility (member of the business and the document's current published version, or a firm user at aal2), `logAccess` records it, and a signed URL with **60 s** expiry is returned as a redirect.
- Uploads validated by size, MIME **and** real file signature (`%PDF-` magic bytes; CSV heuristics). Malware scanning if a scanner is available; otherwise a documented limitation.
- **Never persist an Anthropic file ID.** PDFs are sent per request as base64 document blocks; if a Files API upload is unavoidable it is deleted immediately and never reused across tenants.

### Accepted advisor warnings

The Supabase security advisor flags items that are correct for this schema — do not "fix" blindly:

- **`0029` SECURITY DEFINER executable by `authenticated`** on `is_entity_member`, `is_entity_owner`, `shares_entity_with` (and `is_firm_admin` once added). They run *inside RLS policies* with the querying role's privileges; revoking EXECUTE from `authenticated` breaks every query. `anon`/`public` EXECUTE is already revoked (guarded by the anonymous test in `tests/e2e/rls.spec.ts`).
- **`public_bucket_allows_listing` on `avatars`** — by design.
- **Leaked-password protection disabled** — Supabase Pro feature; enable before the first real production user.

### AI safety (Nick + ingestion)

- **Tool schemas never accept a tenant identifier.** `business_entity_id` is closed over from the session in the handler. Tools are read-only; none mutate state, send email, or change configuration.
- Every tool input is Zod-validated even though the model produced it; tool results are small, typed, never raw.
- Uploaded-document text and tool outputs are wrapped in delimiters and declared untrusted in the system prompt.
- The model never does arithmetic that can be done deterministically; totals, variances, reconciliation live in TypeScript/SQL (`lib/ingestion/reconcile.ts`).
- A numeric answer without a citation is rejected server-side and retried once. Sensitive actions (export, download link) require an explicit confirmation turn.
- Cost controls: per-entity daily token budget, per-user rate limit, tool-iteration cap, `max_tokens` per model role. The system prompt is snapshot-tested.

### Logging hygiene

- No financial content, PII, tokens or secrets in logs, error messages, audit metadata, or cache rows. Masked account numbers only. Job errors store an error *code*, never document content.
- `logAccess()` records identifiers and counts, never content.

### Headers (Phase 6 hardening)

```
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
Content-Security-Policy: strict; allow self, fonts.gstatic.com, *.supabase.co, api.anthropic.com
```

### Dependencies & SSRF

- `pnpm audit` in CI; lockfile committed; no new dependency without justification.
- The server only fetches `*.supabase.co` and `api.anthropic.com`. No user-controlled URL is ever fetched server-side.

---

## Data classification

| Class | Examples | Storage | Logging |
|---|---|---|---|
| **Secret** | Supabase service-role key, Anthropic key, job/rate-limit secrets | Env vars on Vercel | Never |
| **Confidential** | Uploaded documents, statement lines, transactions, tax figures, Nick conversations | Private Storage + Postgres (RLS) | Never |
| **Restricted** | User emails, names | Postgres (RLS), `profiles` | Redacted |
| **Public** | Business display name | Postgres (RLS) | OK |

---

## Compliance considerations

- **Access logging:** every document download, report export, publish/unpublish, and chat send → `audit_logs`.
- **Right to access / delete:** data export and account-deletion requests are queued for firm confirmation (Phase 5). Audit rows are retained with `actor_id` nulled.
- **Backups:** Supabase point-in-time recovery; quarterly restore drill.
- **Vendors:** Supabase, Vercel, Anthropic, Google (OAuth).

---

## Incident response (lightweight)

1. **Detect** — error tracker, Supabase log alert, or user report.
2. **Contain** — rotate the affected secret; revoke sessions if needed (`supabase.auth.admin.signOut`).
3. **Assess** — query `audit_logs` for affected businesses and time range.
4. **Notify** — affected clients within 72 hours if confidential data is touched.
5. **Post-mortem** — `docs/incidents/YYYY-MM-DD-slug.md`. Blameless.

---

## Pre-commit checklist

- [ ] No logging of secrets, PII, or financial figures
- [ ] No `any`
- [ ] New tables: RLS enabled + policies in the same migration + isolation test
- [ ] Every Server Action / Route Handler input validated with Zod
- [ ] Tenant id derived from the session, never the client or the model
- [ ] No new dependency without a justifying comment
- [ ] `pnpm typecheck && pnpm lint && pnpm test` pass
- [ ] Touching auth, RLS, storage, or Nick: a Playwright test covers the new path
