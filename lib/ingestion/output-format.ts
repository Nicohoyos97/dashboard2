// Structured-output format built from a Zod schema. The SDK helper strips
// keywords the API rejects (min/max/pattern…) but — in @anthropic-ai/sdk
// 0.123 — also demotes `enum` / `const` into descriptions even though the API
// enforces both. Restoring them keeps the grammar constrained to our unions;
// auto-generated constraint hints are dropped so the schema stays clean.
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';

type JsonSchema = Record<string, unknown>;

function isObject(value: unknown): value is JsonSchema {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function restore(sent: JsonSchema, raw: JsonSchema): JsonSchema {
  const out: JsonSchema = { ...sent };
  if (Array.isArray(raw.enum)) out.enum = raw.enum;
  if ('const' in raw) out.const = raw.const;
  if (typeof raw.description === 'string') out.description = raw.description;
  else delete out.description;

  for (const key of ['properties', '$defs']) {
    const sentChildren = out[key];
    const rawChildren = raw[key];
    if (!isObject(sentChildren) || !isObject(rawChildren)) continue;
    out[key] = Object.fromEntries(
      Object.entries(sentChildren).map(([name, child]) => {
        const rawChild = rawChildren[name];
        return [name, isObject(child) && isObject(rawChild) ? restore(child, rawChild) : child];
      }),
    );
  }
  if (isObject(out.items) && isObject(raw.items)) out.items = restore(out.items, raw.items);
  if (Array.isArray(out.anyOf) && Array.isArray(raw.anyOf)) {
    const rawVariants: unknown[] = raw.anyOf;
    out.anyOf = out.anyOf.map((child: unknown, index) => {
      const rawChild = rawVariants[index];
      return isObject(child) && isObject(rawChild) ? restore(child, rawChild) : child;
    });
  }
  return out;
}

export function apiOutputFormat<S extends z.ZodType>(schema: S): ReturnType<typeof zodOutputFormat<S>> {
  const format = zodOutputFormat(schema);
  const raw: unknown = z.toJSONSchema(schema, { reused: 'ref' });
  if (!isObject(raw)) return format;
  return { ...format, schema: restore(format.schema, raw) };
}
