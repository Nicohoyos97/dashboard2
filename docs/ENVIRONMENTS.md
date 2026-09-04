# Environments — Local vs Cloud Supabase

We run against **two separate Supabase instances**. Knowing which one you're pointed at — and never mixing them — is the whole point of this doc.

## TL;DR

| Context | Supabase | Config source |
|---|---|---|
| **Local dev** (your machine) | Docker Supabase (`pnpm supabase:start`, project id `dashboard2`) | `.env.local` |
| **Vercel production** — `https://app.hoyosbaker.com`, live since 2026-09-04 | Cloud project for 2.0 — **still to create** (see below) | Vercel env vars |

> **The production deploy cannot serve a page until the Supabase variables are
> set in Vercel.** The middleware resolves a session on every request, so
> without them every route answers `503 supabase_env_missing` (before that
> guard existed it was an opaque platform 500 on the whole domain).

- **Local for dev.** Test users never pollute the cloud DB, auth emails land in the local mail catcher (Mailpit, `http://127.0.0.1:54324`), and `pnpm db:reset` is free.
- **Cloud for Vercel.** Preview and production read their own environment variables from the Vercel dashboard — never from a file here.
- **Never mix.** Don't point local dev at the cloud project; don't bake cloud secrets into the repo.

## Which Supabase does production use?

Neither of the two you already have:

- **Not the values in `.env.local`.** Those are the local Docker stack:
  `http://127.0.0.1:54321` with the demo `anon` / `service_role` keys that ship
  identically with every Supabase CLI installation. They are not secret, and
  the host does not exist outside your machine.
- **Not the v1 project (`dzuipbehfiamnqmwwjzm`).** Dashboard 2.0 is a different
  product with a different schema — `0001_baseline.sql` creates `profiles`,
  `business_entities`, `entity_memberships` and the rest from scratch, and
  pushing it onto v1's QuickBooks-era schema would collide on the tables that
  share a name and leave the ones that do not as dead weight. v1 stays as the
  archive of Dashboard 1.0.

Dashboard 2.0 gets its own project, created once (below), and its URL + keys go
into Vercel. The one thing both environments **do** share is the Google Cloud
OAuth client: same Client ID/Secret, one more authorized redirect URI.

## Creating the cloud project (one-time, needs your Supabase account)

```bash
npx supabase login
npx supabase projects create dashboard2 --org-id <your-org-id> --region <region> --db-password <strong-password>
npx supabase link --project-ref <new-ref>
npx supabase db push                     # applies 0001–0013 in order
```

Then:

1. Dashboard → Project Settings → API: copy the URL, `anon` key and `service_role` key into **Vercel** env vars (`.env.cloud.example` lists them).
2. Dashboard → Authentication → Providers → **Google**: paste the same Client ID/Secret used locally. In Google Cloud Console add `https://<new-ref>.supabase.co/auth/v1/callback` as an authorized redirect URI.
3. Dashboard → Authentication → **MFA**: enable TOTP (required for firm admins).
4. Dashboard → Authentication → URL configuration: site URL `https://app.hoyosbaker.com`, redirect `https://app.hoyosbaker.com/callback`.
5. Copy `.mcp.json.example` → `.mcp.json` with the new ref (read-only) so Claude Code can inspect the cloud schema; run `/mcp` once to authorize.
6. Grant the first firm admin against the cloud database — the portal has no
   self-serve path into `/admin`:
   `SUPABASE_SERVICE_ROLE_KEY=<cloud> NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co pnpm firm:admin -- <email>`

## Vercel environment variables

Set every row for **Production** (and Preview, if you use it). `NEXT_PUBLIC_*`
values are **inlined into the bundle at build time**, so adding them is not
enough — redeploy afterwards, or the build that is live keeps the old (missing)
value.

| Variable | Value | Where it comes from |
|---|---|---|
| `NEXT_PUBLIC_APP_URL` | `https://app.hoyosbaker.com` | The custom domain. Used to build the email confirmation / password-reset return URLs. |
| `APP_URL` | `https://app.hoyosbaker.com` | Fallback when a request carries no host header (member invitations). |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<new-ref>.supabase.co` | Dashboard → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | the `anon` / publishable key | idem — safe on the client |
| `SUPABASE_SERVICE_ROLE_KEY` | the `service_role` key | idem — **server-only**, never `NEXT_PUBLIC_` |
| `ANTHROPIC_API_KEY` | your key | Same as local |
| `ANTHROPIC_FAST_MODEL` / `ANTHROPIC_REASONING_MODEL` | same IDs as `.env.local` | Model IDs are configuration, never hard-coded |
| `NICK_DAILY_TOKEN_BUDGET` | optional, defaults to `2000000` | Per business, per UTC day |
| `CRON_SECRET` | a **new** `openssl rand -hex 32` | Vercel Cron sends it as `Authorization: Bearer …` to `/api/jobs/process-documents`; without it the route answers 401 and no uploaded document is ever processed. Do not reuse the local one. |

`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` are **not** Vercel variables: only
the local Supabase CLI reads them (`supabase/config.toml`). In the cloud, Google
lives in the Supabase Dashboard.

Two plan-dependent settings to check after the first deploy: `vercel.json` asks
for a once-a-minute cron and `app/api/jobs/process-documents` declares
`maxDuration = 300`; both need a Vercel plan above Hobby, which caps crons at
one run a day and functions at 60 s.

## Diagnosing a deploy

```bash
curl -sI https://app.hoyosbaker.com/signin      # 200 → serving; 503 → read the body
curl -s  https://app.hoyosbaker.com/signin      # names the missing half: config or auth service
```

Static assets (`/brand/*.png`) bypass the middleware, so a 200 there with a 503
on every page means the build shipped fine and the environment is what is
wrong.

## Use a single origin — `localhost` in dev

Dev runs on **one** origin so session cookies and OAuth redirects never split. The browser treats `127.0.0.1:3000` and `localhost:3000` as different origins; a cookie set on one is not sent to the other, which breaks auth. Every host-bearing value — `NEXT_PUBLIC_APP_URL` / `APP_URL`, `supabase/config.toml` `site_url` + `additional_redirect_urls`, Playwright's `baseURL` — points at **`http://localhost:3000`**. Next.js dev normalizes `nextUrl.host` to `localhost` and next-intl builds its locale rewrite from it, so `127.0.0.1` cannot be kept in dev. Open the app at `http://localhost:3000`.

## Google OAuth across environments

One Google Cloud OAuth client serves both environments (two redirect URIs registered). Locally, the Supabase CLI reads `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` from `.env.local` to wire `[auth.external.google]` in `supabase/config.toml`. In the cloud, Google is configured in the **Supabase Dashboard**, not via Vercel env vars.

## Which file is which

| File | Committed? | Purpose |
|---|---|---|
| `.env.example` | ✅ | Every variable the app uses, `REPLACE_ME` placeholders. Copy to `.env.local`. |
| `.env.cloud.example` | ✅ | The cloud-only values (Supabase URL + keys). Placeholders; real values go to Vercel. |
| `.env.local` | ❌ (gitignored) | Your local dev values — Docker Supabase demo keys + your Anthropic / Google keys. |
| `.mcp.json.example` | ✅ | Template for the Supabase MCP (read-only). Copy to `.mcp.json` (gitignored). |

## Where the real cloud secrets live

- **`service_role`:** password manager + Vercel env vars **only**. Never in the repo.
- **`anon`:** Supabase Dashboard → Project Settings → API. Safe on the client; set it in Vercel.
- **Project URL:** Dashboard → Project Settings → API.

## Variables that don't change per environment

`ANTHROPIC_API_KEY`, `ANTHROPIC_FAST_MODEL`, `ANTHROPIC_REASONING_MODEL` and the Google OAuth pair are the same regardless of which Supabase you target — see `.env.example`.

## One `.next` per process

`next dev`, `next build` and a second `next dev` (Playwright's) all write to `.next`; run two of them at once and both end up with missing CSS or `__webpack_modules__[moduleId] is not a function`. `next.config.ts` therefore honours `NEXT_DIST_DIR`:

- Playwright's own server (`PLAYWRIGHT_PORT=…` or `NICK_E2E=1`) builds into `.next-e2e` automatically.
- A verification build beside a running dev server: `NEXT_DIST_DIR=.next-build pnpm build`.
- If a dev server ever loses its styles, stop it, delete `.next`, and start it again.
