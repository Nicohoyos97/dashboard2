---
name: multi-tenant-data-access
description: Use this skill whenever you read or write tenant data in app code — any query against business_entities, entity_memberships, profiles, chat_*, audit_logs, or any table carrying business_entity_id (documents, financial_reports, bank_transactions, …). Covers the two Supabase clients (RLS-scoped vs service-role), deriving the business entity server-side via getCurrentEntity/requireEntity, why getCurrentUser uses auth.getUser(), the firm-admin path, and the anti-patterns that break tenant isolation. Trigger this skill any time a Server Component, Server Action, Route Handler, job, or Nick tool touches tenant data. Pairs with writing-rls-policies (the DB-side control).
---

# Multi-tenant data access

RLS is the backstop that makes cross-tenant reads impossible at the database. This
skill is how *app code* stays inside that backstop: which client to use, how to get
the current business entity, and what never to do. Read it before writing any query
against tenant data.

> RLS and these helpers are belt-and-suspenders. RLS alone keeps tenants isolated
> even if app code is wrong — but app code that reaches for the service-role client
> silently steps around RLS. The rules below keep that from happening by accident.

## The two clients — pick the right one

| Client | File | RLS | Use for |
|---|---|---|---|
| **Server (anon + session)** | `lib/supabase/server.ts` → `createClient()` | **Enforced**, scoped to the signed-in user | **Everything that touches tenant data** on a user's behalf — reads and writes from Server Components, Server Actions, Route Handlers, Nick tools |
| **Admin (service-role)** | `lib/supabase/admin.ts` → `createAdminClient()` | **Bypassed** | System writes with *no* client policy: `audit_logs` (via `logAccess`), the document-processing job, server-maintained counters. **Never** inside a request handler to read or write tenant data for a user. |

Default to the **server client**. If you find yourself importing `createAdminClient`
to read or write data a user owns, stop — that defeats multi-tenant isolation. The
admin client is `server-only` and exists for the handful of writes RLS deliberately
has no policy for (see the "no write policy" pattern in `writing-rls-policies`).
A background job that uses it must name the `business_entity_id` it works on
explicitly (INITIAL_PROMPT.md §9).

**Firm admins are not a service-role case.** They reach client data through the
`is_firm_admin()` policy path (tenant SELECT policies are
`is_entity_member(...) OR is_firm_admin()`), using the ordinary RLS-scoped client
with their own session (+ `aal2`).

## Resolving who and where — the `lib/auth/` helpers

```ts
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { getCurrentEntity } from '@/lib/auth/getCurrentEntity';
import { requireEntity } from '@/lib/auth/requireEntity';
```

- **`getCurrentUser(): Promise<User | null>`** — the authenticated user, or `null`.
  Uses `supabase.auth.getUser()` (validates the JWT with the auth server), **never
  `getSession()`** (which trusts an unverified cookie). Always.
- **`getCurrentEntity(): Promise<CurrentEntity | null>`** — `{ id, name, role }` for
  the caller's current business, or `null`. Membership is many-to-many; until the
  entity switcher ships, "current" = the **earliest-joined** membership. `null` is a
  normal state (the firm hasn't linked the user yet) — render the pending state,
  never create a business.
- **`requireEntity(): Promise<CurrentEntity>`** — same, but redirects: no session →
  `/signin`; no membership → `/dashboard` (pending state). Use it in any Server
  Action / Route Handler that operates on tenant data, so the entity is guaranteed
  and typed non-null.

## The golden rule: derive the entity server-side, never from the client or the model

The `business_entity_id` for any operation comes from `requireEntity()` /
`getCurrentEntity()` — **never** from a form field, query param, request body, or a
tool argument produced by the model. RLS would reject a forged id anyway, but passing
client-supplied ids is the shape of an IDOR bug and must not appear in our code.

```ts
// ✅ correct — entity derived from the session, query is RLS-scoped
export async function renameBusiness(input: unknown) {
  const { name } = renameSchema.parse(input);      // Zod at the boundary
  const entity = await requireEntity();            // entity from session, not client
  const supabase = await createClient();           // RLS-scoped client
  const { error } = await supabase
    .from('business_entities')
    .update({ name })
    .eq('id', entity.id);                          // RLS re-checks membership + role
  if (error) throw error;
}
```

```ts
// ❌ wrong — trusts an entity id from the caller; never do this
export async function renameBusiness(entityId: string, name: string) {
  const supabase = await createClient();
  await supabase.from('business_entities').update({ name }).eq('id', entityId);
}
```

Nick tools follow the same rule: the handler closes over `entity.id` from the
session; **no tool schema accepts a tenant identifier** (INITIAL_PROMPT.md §10).

Even with the correct version, the write only succeeds if an RLS policy allows it
(`entities_owner_update` gates business-profile edits to `client_owner`). App-side
role checks are a UX nicety; **RLS is the enforcement.**

## Writes RLS has no policy for — `logAccess`, not raw admin client

Audit and other system writes go through their purpose-built helper, which uses the
admin client internally and is engineered to never throw into the user's action:

```ts
import { logAccess } from '@/lib/audit/logAccess';
await logAccess({ action: 'document.download', resourceType: 'document_version', resourceId: v.id });
```

Log identifiers and counts, never content. Don't reach for `createAdminClient()`
directly to write audit rows — use `logAccess`.

## Checklist before shipping a query against tenant data

- [ ] Uses the **server client** (`createClient`), not `createAdminClient`.
- [ ] Entity id comes from `requireEntity()` / `getCurrentEntity()` — **never** the client or the model.
- [ ] Input validated with **Zod** at the Server Action / Route Handler / tool boundary.
- [ ] The table has an RLS policy that actually permits this operation for this role
      (cross-check with `writing-rls-policies`).
- [ ] Document bytes are served via a route handler + signed URL (≤ 60 s), never a public URL.
- [ ] Sensitive access is recorded via `logAccess` where required by `docs/SECURITY.md`.
- [ ] No PII or financial figures in any log or error message.
