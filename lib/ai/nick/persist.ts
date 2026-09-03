// Nick's persistence. Reads go through the caller's RLS-scoped client
// (conversations are private to the entity's members and the firm has no
// read path); writes to chat_messages, chat_citations, ai_usage_daily and the
// session counters use the service role because those tables have no client
// write policy (Archetype A) and every row names its business entity.
import type Anthropic from '@anthropic-ai/sdk';
import 'server-only';

import type { Json } from '@/lib/supabase/types';

import { stripMarkers } from './citations';
import type { AdminDb, Db } from './tools/context';
import {
  type CitationRecord,
  type PendingAction,
  type StoredAssistant,
  type ThreadMessage,
  storedAssistantSchema,
  storedUserSchema,
} from './types';

export type SessionRow = {
  id: string;
  title: string | null;
  createdAt: string;
  lastMessageAt: string | null;
};

const SESSION_COLUMNS = 'id, title, created_at, last_message_at';
const MAX_SESSIONS = 50;
const TITLE_CHARS = 60;

function toSession(row: {
  id: string;
  title: string | null;
  created_at: string;
  last_message_at: string | null;
}): SessionRow {
  return {
    id: row.id,
    title: row.title,
    createdAt: row.created_at,
    lastMessageAt: row.last_message_at,
  };
}

/** The caller's own conversations for this business, newest first. */
export async function listSessions(
  supabase: Db,
  entityId: string,
  userId: string,
): Promise<SessionRow[]> {
  const { data } = await supabase
    .from('chat_sessions')
    .select(SESSION_COLUMNS)
    .eq('business_entity_id', entityId)
    .eq('user_id', userId)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(MAX_SESSIONS);
  return (data ?? []).map(toSession);
}

export async function loadSession(
  supabase: Db,
  entityId: string,
  userId: string,
  sessionId: string,
): Promise<SessionRow | null> {
  const { data } = await supabase
    .from('chat_sessions')
    .select(SESSION_COLUMNS)
    .eq('id', sessionId)
    .eq('business_entity_id', entityId)
    .eq('user_id', userId)
    .maybeSingle();
  return data ? toSession(data) : null;
}

/** Inserted through RLS: the policy requires membership and user_id = auth.uid(). */
export async function createSession(
  supabase: Db,
  entityId: string,
  userId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('chat_sessions')
    .insert({ business_entity_id: entityId, user_id: userId })
    .select('id')
    .single();
  if (error || !data) return null;
  return data.id;
}

export async function loadThread(supabase: Db, sessionId: string): Promise<ThreadMessage[]> {
  const { data } = await supabase
    .from('chat_messages')
    .select('id, role, content, created_at')
    .eq('session_id', sessionId)
    .in('role', ['user', 'assistant'])
    .order('created_at');
  return (data ?? []).flatMap((row): ThreadMessage[] => {
    if (row.role === 'user') {
      const parsed = storedUserSchema.safeParse(row.content);
      return parsed.success
        ? [{ id: row.id, role: 'user', createdAt: row.created_at, text: parsed.data.text }]
        : [];
    }
    const parsed = storedAssistantSchema.safeParse(row.content);
    if (!parsed.success) return [];
    return [
      {
        id: row.id,
        role: 'assistant',
        createdAt: row.created_at,
        text: parsed.data.text,
        citations: parsed.data.citations,
        pendingAction: parsed.data.pendingAction,
      },
    ];
  });
}

/** Prior turns as plain text; old citation markers are stripped so the model cannot reuse a stale key. */
export function threadToModelMessages(
  thread: readonly ThreadMessage[],
  limit: number,
): Anthropic.MessageParam[] {
  return thread.slice(-limit).map((message) => ({
    role: message.role,
    content: message.role === 'assistant' ? stripMarkers(message.text) : message.text,
  }));
}

export function lastPendingAction(thread: readonly ThreadMessage[]): PendingAction | null {
  const last = thread.at(-1);
  return last && last.role === 'assistant' ? last.pendingAction : null;
}

export async function insertUserMessage(
  admin: AdminDb,
  input: { sessionId: string; entityId: string; text: string },
): Promise<string | null> {
  const { data, error } = await admin
    .from('chat_messages')
    .insert({
      session_id: input.sessionId,
      business_entity_id: input.entityId,
      role: 'user',
      content: { text: input.text },
    })
    .select('id')
    .single();
  return error || !data ? null : data.id;
}

export async function insertToolMessage(
  admin: AdminDb,
  input: {
    sessionId: string;
    entityId: string;
    name: string;
    toolInput: unknown;
    result: unknown;
    ok: boolean;
  },
): Promise<void> {
  const content = {
    name: input.name,
    input: input.toolInput,
    result: input.result,
    ok: input.ok,
  } as Json;
  await admin
    .from('chat_messages')
    .insert({
      session_id: input.sessionId,
      business_entity_id: input.entityId,
      role: 'tool',
      content,
    });
}

export async function insertAssistantMessage(
  admin: AdminDb,
  input: { sessionId: string; entityId: string; content: StoredAssistant },
): Promise<string | null> {
  const { data, error } = await admin
    .from('chat_messages')
    .insert({
      session_id: input.sessionId,
      business_entity_id: input.entityId,
      role: 'assistant',
      content: input.content as Json,
    })
    .select('id')
    .single();
  return error || !data ? null : data.id;
}

export async function insertCitations(
  admin: AdminDb,
  input: {
    entityId: string;
    sessionId: string;
    messageId: string;
    citations: readonly CitationRecord[];
  },
): Promise<void> {
  if (input.citations.length === 0) return;
  await admin.from('chat_citations').insert(
    input.citations.map((c) => ({
      business_entity_id: input.entityId,
      session_id: input.sessionId,
      message_id: input.messageId,
      citation_key: c.key,
      label: c.label,
      report_id: c.reportId,
      document_version_id: c.documentVersionId,
      line_id: c.lineId,
      page_number: c.page,
      period_start: c.periodStart,
      period_end: c.periodEnd,
      source: c.source,
    })),
  );
}

export async function usedTokensToday(
  admin: AdminDb,
  entityId: string,
  day: string,
): Promise<number> {
  const { data } = await admin
    .from('ai_usage_daily')
    .select('input_tokens, output_tokens')
    .eq('business_entity_id', entityId)
    .eq('day', day)
    .maybeSingle();
  return data ? data.input_tokens + data.output_tokens : 0;
}

/** Adds a turn's tokens to the daily counter and the session totals; sets the title on the first turn. */
export async function recordUsage(
  admin: AdminDb,
  input: {
    entityId: string;
    sessionId: string;
    day: string;
    usage: { input: number; output: number };
    firstUserText: string | null;
  },
): Promise<void> {
  const { data: daily } = await admin
    .from('ai_usage_daily')
    .select('input_tokens, output_tokens, messages')
    .eq('business_entity_id', input.entityId)
    .eq('day', input.day)
    .maybeSingle();
  await admin.from('ai_usage_daily').upsert(
    {
      business_entity_id: input.entityId,
      day: input.day,
      input_tokens: (daily?.input_tokens ?? 0) + input.usage.input,
      output_tokens: (daily?.output_tokens ?? 0) + input.usage.output,
      messages: (daily?.messages ?? 0) + 1,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'business_entity_id,day' },
  );
  const { data: session } = await admin
    .from('chat_sessions')
    .select('total_input_tokens, total_output_tokens, title')
    .eq('id', input.sessionId)
    .maybeSingle();
  const title =
    session?.title ??
    (input.firstUserText
      ? input.firstUserText.replace(/\s+/g, ' ').trim().slice(0, TITLE_CHARS)
      : null);
  await admin
    .from('chat_sessions')
    .update({
      total_input_tokens: (session?.total_input_tokens ?? 0) + input.usage.input,
      total_output_tokens: (session?.total_output_tokens ?? 0) + input.usage.output,
      last_message_at: new Date().toISOString(),
      title,
    })
    .eq('id', input.sessionId);
}
