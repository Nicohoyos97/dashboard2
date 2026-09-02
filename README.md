# Hoyos Baker — Client Portal (Dashboard 2.0)

Client Portal + Firm Admin Portal for an accounting firm. The firm uploads financial documents; clients see interactive statements, expenses, taxes, reminders, original downloads, and ask **Nick**, an AI financial assistant. Multi-tenant on Supabase RLS. No QuickBooks integration.

🌐 **Production:** [app.hoyosbaker.com](https://app.hoyosbaker.com)

## Stack

Next.js 15 (App Router) · TypeScript · next-intl · Supabase (Auth + Google OAuth + Postgres/RLS + Storage) · Anthropic API · Tailwind v4 + shadcn/ui · Recharts · Vercel

## Getting started

```bash
pnpm install
cp .env.example .env.local       # fill in the secrets (see docs/ENVIRONMENTS.md)
pnpm supabase:start              # local Supabase (Docker) — applies migrations
pnpm db:types                    # regenerate lib/supabase/types.ts
pnpm dev                         # http://localhost:3000
```

## Documentation

Read [`CLAUDE.md`](./CLAUDE.md) first, then [`INITIAL_PROMPT.md`](./INITIAL_PROMPT.md) (the product spec).

| Doc | Purpose |
|---|---|
| [`CLAUDE.md`](./CLAUDE.md) | Project memory for Claude Code — rules, stack, layout |
| [`INITIAL_PROMPT.md`](./INITIAL_PROMPT.md) | Product spec: portals, data model, ingestion, Nick, phases, acceptance |
| [`docs/ASSUMPTIONS.md`](./docs/ASSUMPTIONS.md) | Reuse decisions from the v1 bootstrap + running assumptions |
| [`docs/DATABASE.md`](./docs/DATABASE.md) | Baseline schema, RLS archetypes, migration workflow |
| [`docs/SECURITY.md`](./docs/SECURITY.md) | Threat model and controls |
| [`docs/ENVIRONMENTS.md`](./docs/ENVIRONMENTS.md) | Local vs cloud Supabase, env files, Google OAuth |
| [`docs/CODE_STYLE.md`](./docs/CODE_STYLE.md) | Conventions |

## License

Proprietary — © Hoyos Baker 2026.
