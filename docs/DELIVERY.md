# Delivery report

Hoyos Baker — Client Portal (Dashboard 2.0). Written against `INITIAL_PROMPT.md`
§13. Status at 2026-09-04; phases 0–5 complete, phase 6 in progress.

---

## 1. Completed features by phase

**Phase 0 — Discovery.** `docs/PLAN.md` (architecture, schema, RLS design, job
runner and PDF library choices). Checkpoint 1 approved.

**Phase 1 — Foundations.** Next.js 15 App Router under `app/[locale]/` with
next-intl (`en` default, `es` under `/es`); Supabase auth (email/password +
Google, preserved from v1) with TOTP MFA gating `/admin`; migrations `0001`–
`0005`; RLS on every tenant table with cross-tenant isolation tests; private
`documents` and `exports` buckets (`avatars` is public-read by design); §6 design
tokens; the shell for both portals (sidebar, top bar, entity switcher, responsive
drawer). Checkpoint 2 approved.

**Phase 2 — Admin + ingestion.** Client and business management, the guided
uploader, the document-processing pipeline (classification → extraction →
reconciliation), the review queue with per-field correction, publish / version /
supersede, and audit views.

**Phase 3 — Client core.** Overview, interactive Profit & Loss and Balance Sheet
(expand/collapse, row drawer, CSV export, original-PDF download), the reports
library, and reminders.

**Phase 4 — Nick.** `lib/ai/nick/`: a fast-model router, eleven read-only tools
closed over the session's entity, a per-turn citation registry with a
server-side gate (no citation, no number; one corrective retry), a streaming
loop capped at eight iterations, confirmation turns for downloads and exports,
persistence, a rate limit and a daily token budget, `POST /api/chat` over SSE,
and the contextual "Ask Nick" panel.

**Phase 5 — Remaining modules.**
- **Expenses** — one source only, debits on published bank statements. Filters,
  sort and paging live in the URL; aggregation runs in Postgres
  (`portal_expense_summary`); CSV export re-derives the set server-side.
- **Income Taxes / Sales Taxes** — firm-document or firm-entry rows keeping the
  status the firm set; nothing reads as final unless `firm_confirmed`;
  deterministic alert rules. Sales Taxes is gated on `sales_tax_enabled` in both
  the nav and the route.
- **Notifications** — the top-bar bell, plus per-user, per-business preferences
  that `notifyEntityMembers` honours before inserting.
- **Settings** — profile, business, members, notifications, and Data & privacy
  (data-export and account-deletion requests queued for the firm).
- **Help** — nine FAQ entries covering sources, coverage gaps and tax statuses.

**Phase 6 — Hardening (in progress).** `pnpm seed:demo`; an audit pass
(`/code-review` at high effort plus a security review) that fixed 22 defects and
added migration `0009`; a business time zone (`0010`); expense aggregation in
Postgres (`0011`, `0012`); and an accessibility and mobile pass. Remaining:
the three §14 gaps in §6 below.

---

## 2. Test results

| Suite | Result |
|---|---|
| `pnpm test` (Vitest, unit + integration) | **334 passed, 1 skipped** (36 files) |
| `pnpm test:e2e` (Playwright) | **45 passed, 2 skipped** (47) |
| Nick browser spec (`NICK_E2E=1`) | **2 passed** — the two skips above |
| `pnpm typecheck` | clean |
| `pnpm lint` | clean (`--max-warnings=0`) |
| `pnpm build` | clean, 59 static pages |

**Skips and why.** `tests/unit/ingestion/live.test.ts` calls the real Anthropic
API and runs only with `INGESTION_LIVE=1`, so it does not spend tokens or need a
key in CI. `tests/e2e/nick.spec.ts` needs the mocked Messages API and runs under
`NICK_E2E=1`; a reused dev server would otherwise call the real API. Both pass
when enabled — the Nick run is recorded above. `tests/integration/worker.test.ts`
skips without local Supabase.

Accessibility is asserted, not claimed: `tests/e2e/accessibility.spec.ts` runs
axe (WCAG 2.1 A + AA) over all eleven client-portal routes and the sign-in page,
and checks the 390 px layout.

---

## 3. Assumptions

Every reuse and design decision is recorded, dated, in `docs/ASSUMPTIONS.md`
(~40 entries). The ones that shape the product most:

- **Sources never mix.** Cash figures come only from published bank statements;
  revenue and net income only from the Profit & Loss. Where both appear they are
  labelled and never combined.
- **Coverage gates totals.** A period whose published statements do not cover
  every account, every day, shows the reason instead of a number. Missing days
  are never zero.
- **Printed totals only.** Statement KPIs read totals the document itself
  prints, through a deliberately small synonym table; an unfamiliar layout
  yields `null` with a reason rather than a guess.
- **Nothing is final unless the firm says so.** Tax figures carry the firm's own
  status; `estimated`, `payable` and `pending_review` are visibly provisional.
- **Each business keeps its own calendar** (`0010`), so "today" is the client's
  date, not the server's.
- **A deletion request is a row the firm acts on**, never a client-side delete.

---

## 4. Deviations from the prompt, and why

1. **The Overview KPIs are the P&L headline figures**, not the bank's cash trio
   (§7 lists both among "available metrics"). The owner asked for Gross Income,
   Total Expenses, Gross Profit and Net Income on 2026-09-03. The cash figures
   moved to Expenses and the insight rules.
2. **The Overview's main chart is Income vs Expense**, not the cash chart §7
   describes, and the source pill left the KPI cards — both at the owner's
   request. The source still travels in each card's "how is this calculated"
   tooltip, which distinguishes a firm-entered P&L from a published document.
3. **Card 3 is named Gross Profit.** The owner asked for "operative net income
   (what is left between gross and cost of goods sold)"; that figure is Gross
   Profit, and a financial product must not mislabel it.
4. **Series colours are teal and amber**, not the reference's two greens: green
   is reserved for positive *status* in this palette, and two hues separate
   better than two shades under colour-vision deficiency.
5. **Expense aggregation runs in SQL** rather than TypeScript (`0011`). PostgREST
   cannot group, and the page was materialising the whole period to add it up.
6. **PDF export is not implemented.** `create_financial_export` produces CSV;
   PDF was deferred with the reporting work and is not in any shipped path.

---

## 5. Security checklist

**RLS.** 35 `enable row level security` statements across `0001`–`0012`; every
table holding tenant data filters by `business_entity_id` through
`is_entity_member()`, with `is_firm_member()` / `is_firm_admin()` (both requiring
`aal2`) as the firm's path. Three archetypes are documented in
`docs/DATABASE.md` and the `writing-rls-policies` skill. Derived tables
(statement lines, transactions, insights, citations) have **no client write
policy at all**; `audit_logs` has no client read path.

**Storage.** `documents` and `exports` are private; membership is checked from
the tenant id embedded in the object path. Reads reach the client only through a
route handler that verifies membership and publication, audits the access, and
returns a signed URL expiring in 60 s. `avatars` is public-read with
owner-folder writes — a documented exception.

**Secrets.** `SUPABASE_SERVICE_ROLE_KEY` appears only in Server Actions, Route
Handlers, jobs and `scripts/`; `lib/supabase/admin.ts` is `server-only`. Model
ids come from `ANTHROPIC_FAST_MODEL` / `ANTHROPIC_REASONING_MODEL`, never
hard-coded. `pnpm seed:demo` refuses a non-local project without
`--force-remote`, which in turn requires an explicit `--password`.

**MFA.** `/admin` requires a firm role *and* `aal2`; the helpers read `aal` from
the JWT, so a session that has not passed TOTP sees only its own membership row.
`tests/e2e/admin-gate.spec.ts` proves the gate and the re-challenge.

**Injection defenses.** Zod at every trust boundary (Server Actions, Route
Handlers, search params). PostgREST filter values are escaped before `ilike`
(`escapeLike`, including `*`, which PostgREST rewrites to `%`), and
`portal_expense_summary` escapes its own LIKE pattern rather than trusting the
caller (`0012`). CSV exports quote per RFC 4180 and prefix any untrusted cell
that begins with a spreadsheet formula character. Uploaded-document content and
tool output are treated as data, never instructions, and every figure Nick
states must carry a citation or the turn is rejected.

**Audit.** `logAccess()` writes identifiers, counts and dates — never content,
figures or PII.

---

## 6. Known limitations and next steps

Three §14 criteria are not fully met, all of them scope rather than defects:

1. **§14.16 — "Cash In and Revenue shown as different metrics with different
   sources."** The card that did this (Income behavior) was removed in the
   2026-09-03 redesign. Sources are still never mixed and each page names its
   own, but the two figures are no longer displayed side by side. Restoring it
   is a small card; it is the owner's call.
2. **§14.13 — "Unsupported granularity is disabled with an explanation."** The
   period selector lists only periods that have data, so nothing is fabricated,
   but there is no disabled control carrying the reason. `granularity()` exists
   and is unit-tested; no UI consumes it yet.
3. **§14.19 — "A superseded report remains in the audit history and version
   list."** Supersession is enforced in the data (`superseded_by`, no deletes),
   but no admin view surfaces the superseded chain.

Also open, recorded in `docs/ASSUMPTIONS.md`:

- **No firm-side queue for `account_requests`.** A data-export or deletion
  request sits at `pending` and no one at the firm is notified. This is the
  next Phase 5 remainder and it carries a response-time obligation.
- **Four of the five notification channels have no producer.** Only
  `document.published` fires; reminders, tax deadlines, document activity and
  the weekly email digest are switches without a job behind them.
- **`StatCards` duplicates `KpiCard`'s delta logic**, and the income-tax
  derivations live in the card rather than `lib/reports/taxes.ts`.
- **`scripts/seed-demo.ts` is 570 lines** against the ~300-line guide.
- **The cloud Supabase project is not created.** Migrations have only been
  applied locally; see `docs/ENVIRONMENTS.md`.

---

## 7. Running it locally

```bash
pnpm install
pnpm supabase:start          # Docker; prints the local URL and keys
cp .env.example .env.local   # then fill in the values below
pnpm db:migrate              # apply 0001–0012
pnpm db:types                # regenerate lib/supabase/types.ts
```

`.env.local` needs:

| Variable | Where it comes from |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `pnpm supabase:start` output |
| `SUPABASE_SERVICE_ROLE_KEY` | same output — server-side only |
| `ANTHROPIC_API_KEY` | your key; only Nick and ingestion use it |
| `ANTHROPIC_FAST_MODEL`, `ANTHROPIC_REASONING_MODEL` | model ids, never hard-coded |
| `NICK_DAILY_TOKEN_BUDGET` | optional; defaults to 2,000,000 |
| `CRON_SECRET` | any strong value; the job route requires it as a bearer token |

Then:

```bash
pnpm firm:admin -- you@example.com --password '<pw>'   # first firm admin
pnpm seed:demo                                          # a Demo business, 6 months of data
pnpm dev                                                # http://localhost:3000
```

Sign in as `demo.client@hoyosbaker.test` / `DemoClient!2026` for the client
portal, or as the firm admin for `/admin` (enroll TOTP on first visit).
`pnpm seed:demo -- --remove` reverses the seed.

**The document-processing job** is a route handler, not a daemon. Vercel Cron
calls it in production (`vercel.json`); locally, trigger it after an upload
with the admin portal's "Run jobs" button, or:

```bash
curl -X POST http://localhost:3000/api/jobs/process-documents \
  -H "Authorization: Bearer $CRON_SECRET"
```

**Tests.**

```bash
pnpm typecheck && pnpm lint && pnpm test
pnpm test:e2e                                  # needs local Supabase
NICK_E2E=1 pnpm test:e2e tests/e2e/nick.spec.ts   # boots the mocked Messages API
```
