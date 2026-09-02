# Environments — Local vs Cloud Supabase

We run against **two separate Supabase instances**. Knowing which one you're pointed at — and never mixing them — is the whole point of this doc.

## TL;DR

| Context | Supabase | Config source |
|---|---|---|
| **Local dev** (your machine) | Docker Supabase (`pnpm supabase:start`, project id `dashboard2`) | `.env.local` |
| **Vercel preview / production** | Cloud project for 2.0 — **not created yet** (see below) | Vercel env vars |

- **Local for dev.** Test users never pollute the cloud DB, auth emails land in the local mail catcher (Mailpit, `http://127.0.0.1:54324`), and `pnpm db:reset` is free.
- **Cloud for Vercel.** Preview and production read their own environment variables from the Vercel dashboard — never from a file here.
- **Never mix.** Don't point local dev at the cloud project; don't bake cloud secrets into the repo.

## Creating the cloud project (one-time, needs your Supabase account)

The v1 project (`dzuipbehfiamnqmwwjzm`) stays untouched as the archive of Dashboard 1.0. Dashboard 2.0 gets its **own** project:

```bash
npx supabase login
npx supabase projects create dashboard2 --org-id <your-org-id> --region <region> --db-password <strong-password>
npx supabase link --project-ref <new-ref>
npx supabase db push                     # applies 0001_baseline.sql (+ later migrations)
```

Then:

1. Dashboard → Project Settings → API: copy the URL, `anon` key and `service_role` key into **Vercel** env vars (`.env.cloud.example` lists them).
2. Dashboard → Authentication → Providers → **Google**: paste the same Client ID/Secret used locally. In Google Cloud Console add `https://<new-ref>.supabase.co/auth/v1/callback` as an authorized redirect URI.
3. Dashboard → Authentication → **MFA**: enable TOTP (required for firm admins).
4. Dashboard → Authentication → URL configuration: site URL `https://app.hoyosbaker.com`, redirect `https://app.hoyosbaker.com/callback`.
5. Copy `.mcp.json.example` → `.mcp.json` with the new ref (read-only) so Claude Code can inspect the cloud schema; run `/mcp` once to authorize.

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
