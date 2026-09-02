# Code style

Conventions for this codebase. The goal is *predictability* — anyone (human or Claude) should be able to guess where a thing lives and what it's called.

---

## Language

- **TypeScript strict.** `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`.
- No `any`. Use `unknown` and narrow.
- Prefer `type` for unions and shapes, `interface` only when extension is intentional.
- Discriminated unions for state machines (`type Result<T,E> = { ok: true; value: T } | { ok: false; error: E }`).

## File layout

- One major export per file. Co-locate helpers and types.
- Components: `PascalCase.tsx`. Hooks: `useCamelCase.ts`. Server code: `kebab-case.ts`.
- Folder names: kebab-case.
- Tests sit next to source: `KPICard.tsx` + `KPICard.test.tsx`.
- App Router conventions: `page.tsx`, `layout.tsx`, `loading.tsx`, `error.tsx`, `not-found.tsx`.

## Naming

- Boolean variables and props: `isOpen`, `hasAccess`, `shouldRefetch`. Not `open`, `access`, `refetch`.
- Server Actions: verb in past or imperative — `updateBusinessEntity`, `publishReport`, `sendChatMessage`.
- Tool definitions for the AI: snake_case — `get_pnl`, `search_transactions`.
- DB columns: snake_case. TS fields: camelCase. The mapping lives in our `lib/supabase/types.ts` helpers.

## Components

- Default to **Server Components.** Add `"use client"` only when needed.
- Props typed inline if used once; extract to a named `type FooProps` if exported or reused.
- No barrel `index.ts` files unless they wrap a public package boundary.
- Tailwind classes ordered: layout → box → typography → color → state. Use `clsx` (or `cn`) for conditionals.
- Avoid `useEffect` for data fetching — fetch in Server Components or via Server Actions.

## Server Actions

- Always start with input validation:

  ```ts
  'use server';
  import { z } from 'zod';
  
  const Input = z.object({
    name: z.string().min(1).max(80),
  });
  
  export async function publishReport(raw: unknown) {
    const parsed = Input.parse(raw);
    const { user } = await requireUser();
    // ...
  }
  ```

- Return a `Result`-shaped object for handled failures; throw only for programmer errors.
- Use `revalidatePath` or `revalidateTag` after mutations.

## Error handling

- Define typed errors in `lib/errors.ts` (`QBAuthError`, `QBRateLimitError`, `NotMemberError`, etc.).
- At the action boundary, convert known errors to `{ ok: false, error: { code, message } }`.
- Never `console.error(err)` alone — use the logger; never log token or secret fields.

## Imports

- Absolute imports via `@/*`. No long `../../../` chains.
- Order: node built-ins → external → `@/*` → relative → CSS. Prettier handles this with `@trivago/prettier-plugin-sort-imports`.

## Tests

- Unit: Vitest. One `describe` per public function. Test names read as sentences.
- E2E: Playwright. One spec per user flow. RLS-sensitive flows MUST have a Playwright test.
- Don't snapshot UI components — they encourage churn without thought. Snapshot small structured outputs only.
- Mock external services with `msw` (Anthropic, Intuit). Mock at the network layer, not the function layer.

## Comments

- Comments explain *why*, never *what*.
- `// TODO(person): …` with an owner. Same for `FIXME`.
- Doc comments on exported public API only.

## Git

- Conventional Commits: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`, `perf:`, `sec:`.
- Branch names: `feat/qb-oauth`, `fix/rls-leak-in-chat`, `chore/upgrade-next`.
- Squash-merge PRs. PR title becomes the commit message.
- Each PR ≤ 400 lines of diff where feasible.

## CI gates (must pass before merge)

1. `pnpm typecheck`
2. `pnpm lint`
3. `pnpm test` (unit)
4. `pnpm build`
5. `pnpm test:e2e` on PRs touching `app/`, `lib/auth`, `lib/ingestion`, `lib/ai`
6. `pnpm audit --prod` (block on `high` or `critical`)
