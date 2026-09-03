// Result shape shared by the firm Server Actions. `error` is already
// translated (the action resolves the message server-side, like lib/auth).
export type ActionResult<T = undefined> =
  | { ok: true; value: T }
  | { ok: false; error: string; field?: string };
