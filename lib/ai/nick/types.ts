// Shared contracts for Nick (INITIAL_PROMPT.md §10). Kept free of
// `server-only` and of database access so the pure pieces (citations,
// prompts, schemas) are unit-testable; the loaders live in ./persist.ts.
import { z } from 'zod';

export const NICK_PAGES = ['overview', 'profit_and_loss', 'balance_sheet', 'reports', 'chat'] as const;
export type NickPage = (typeof NICK_PAGES)[number];

export const PERIOD_PARAM = /^\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}$/;

// What the browser may *point at*. Nothing here is trusted as a fact: the
// server resolves every field against published rows before it reaches the
// prompt (./context.ts), exactly as spec §10 "Context" requires.
export const pageContextSchema = z.object({
  page: z.enum(NICK_PAGES).optional(),
  period: z.string().regex(PERIOD_PARAM).optional(),
  lineId: z.string().uuid().optional(),
});
export type PageContext = z.infer<typeof pageContextSchema>;

export type ReportKind = 'profit_and_loss' | 'balance_sheet';
export type SourceLabel = 'firm_document' | 'firm_entry';

export type SelectedLine = {
  lineId: string;
  accountName: string;
  currentCents: number | null;
  priorCents: number | null;
  page: number | null;
  reportId: string;
  reportType: ReportKind;
  documentVersionId: string | null;
  periodStart: string;
  periodEnd: string;
  currency: string;
  source: SourceLabel;
};

export type ResolvedContext = {
  page: NickPage;
  period: { start: string; end: string; label: string } | null;
  line: SelectedLine | null;
};

export const citationRecordSchema = z.object({
  key: z.string(),
  label: z.string(),
  reportId: z.string().nullable(),
  documentVersionId: z.string().nullable(),
  lineId: z.string().nullable(),
  page: z.number().int().nullable(),
  periodStart: z.string().nullable(),
  periodEnd: z.string().nullable(),
  source: z.enum(['firm_document', 'firm_entry']).nullable(),
  href: z.string().nullable(),
});
export type CitationRecord = z.infer<typeof citationRecordSchema>;

export const SENSITIVE_TOOLS = ['get_report_download_link', 'create_financial_export'] as const;
export type SensitiveTool = (typeof SENSITIVE_TOOLS)[number];

// A sensitive tool asked the user to confirm; the next turn may honour it.
export const pendingActionSchema = z.object({
  tool: z.enum(SENSITIVE_TOOLS),
  resourceId: z.string(),
  label: z.string(),
});
export type PendingAction = z.infer<typeof pendingActionSchema>;

// chat_messages.content shapes. Reading back goes through these schemas so a
// malformed row can never crash a page or reach the model unvalidated.
export const storedUserSchema = z.object({ text: z.string() });
export const storedAssistantSchema = z.object({
  text: z.string(),
  citations: z.array(citationRecordSchema),
  toolCalls: z.array(z.object({ name: z.string(), ok: z.boolean() })),
  model: z.enum(['fast', 'reasoning']),
  pendingAction: pendingActionSchema.nullable(),
  usage: z.object({ input: z.number(), output: z.number() }),
});
export const storedToolSchema = z.object({
  name: z.string(),
  input: z.unknown(),
  result: z.unknown(),
  ok: z.boolean(),
});
export type StoredUser = z.infer<typeof storedUserSchema>;
export type StoredAssistant = z.infer<typeof storedAssistantSchema>;

export type ThreadMessage =
  | { id: string; role: 'user'; createdAt: string; text: string }
  | { id: string; role: 'assistant'; createdAt: string; text: string; citations: CitationRecord[]; pendingAction: PendingAction | null };

export type NickErrorCode =
  | 'unauthorized'
  | 'no_entity'
  | 'preview_not_supported'
  | 'rate_limited'
  | 'budget_exhausted'
  | 'invalid_request'
  | 'model_error'
  | 'uncited_answer'
  | 'refusal';

// Server-sent events the route streams; the client mirrors this union.
export type NickEvent =
  | { type: 'session'; sessionId: string }
  | { type: 'status'; tool: string }
  | { type: 'delta'; text: string }
  | { type: 'reset' }
  | { type: 'done'; messageId: string; text: string; citations: CitationRecord[]; pendingAction: PendingAction | null }
  | { type: 'error'; code: NickErrorCode };

export class NickError extends Error {
  constructor(readonly code: NickErrorCode) {
    super(code);
    this.name = 'NickError';
  }
}
