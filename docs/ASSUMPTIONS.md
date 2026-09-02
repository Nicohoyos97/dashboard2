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
