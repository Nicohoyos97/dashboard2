// One Nick turn (spec §10 "Loop"): rate limit and budget → session → persist
// the user message → resolve the page context from the database → route →
// stream the tool loop → persist the answer, its citations and the usage →
// audit. Everything tenant-scoped is derived from the verified session.
import 'server-only';

import type Anthropic from '@anthropic-ai/sdk';

import { MODELS, getAnthropic } from '@/lib/ai/client';
import { logAccess } from '@/lib/audit/logAccess';
import type { CurrentEntity } from '@/lib/auth/getCurrentEntity';
import { loadPortalEntitySettings, loadPublishedBankStatements, loadPublishedReports } from '@/lib/portal/load';
import { RATE_LIMITS, consumeRateLimit } from '@/lib/rate-limit';
import { isoToday } from '@/lib/reminders/status';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

import { CitationRegistry, citationLabel } from './citations';
import { NICK_LIMITS, dailyTokenBudget } from './config';
import { runToolLoop } from './loop';
import {
  createSession,
  insertAssistantMessage,
  insertCitations,
  insertToolMessage,
  insertUserMessage,
  lastPendingAction,
  loadSession,
  loadThread,
  recordUsage,
  threadToModelMessages,
  usedTokensToday,
} from './persist';
import { NICK_SYSTEM_PROMPT, contextBlock } from './prompts';
import { resolveContext } from './resolve-context';
import { routeMessage } from './router';
import { runTool } from './tools';
import { type NickLocale, type ToolContext, label, money, reportHref, statementLabel } from './tools/context';
import { periodText } from './tools/context';
import { toolDefinitions } from './tools/schemas';
import { NickError, type NickEvent, type PageContext, type PendingAction } from './types';

export type TurnInput = {
  userId: string;
  entity: CurrentEntity;
  locale: NickLocale;
  sessionId: string | null;
  message: string;
  context: PageContext | undefined;
  emit: (event: NickEvent) => void;
};

export async function runNickTurn(input: TurnInput): Promise<void> {
  if (input.entity.role === 'firm_preview') throw new NickError('preview_not_supported');
  if (!(await consumeRateLimit(`chat:${input.userId}`, RATE_LIMITS.chat))) throw new NickError('rate_limited');

  const supabase = await createClient();
  const admin = createAdminClient();
  const entityId = input.entity.id;
  const today = isoToday();
  if ((await usedTokensToday(admin, entityId, today)) >= dailyTokenBudget()) throw new NickError('budget_exhausted');

  const sessionId = input.sessionId
    ? (await loadSession(supabase, entityId, input.userId, input.sessionId))?.id ?? null
    : await createSession(supabase, entityId, input.userId);
  if (!sessionId) throw new NickError('invalid_request');
  input.emit({ type: 'session', sessionId });

  const thread = await loadThread(supabase, sessionId);
  const pending = lastPendingAction(thread);
  await insertUserMessage(admin, { sessionId, entityId, text: input.message });

  const [settings, reports, statements] = await Promise.all([
    loadPortalEntitySettings(supabase, entityId),
    loadPublishedReports(supabase, entityId),
    loadPublishedBankStatements(supabase, entityId),
  ]);
  const anthropic = getAnthropic();
  const [context, decision] = await Promise.all([
    resolveContext(supabase, entityId, input.locale, input.context, { reports, statements }),
    routeMessage(anthropic, MODELS.fast, { message: input.message, pendingActionLabel: pending?.label ?? null }),
  ]);

  const registry = new CitationRegistry();
  const shape = { locale: input.locale, currency: settings.currency, registry };
  const line = context.line;
  const selectedLineCite = line
    ? registry.add({
        label: citationLabel([statementLabel(input.locale, line.reportType), periodText(line.periodStart, line.periodEnd, input.locale), line.page ? `${label(input.locale, 'page')} ${line.page}` : null, line.accountName]),
        reportId: line.reportId,
        documentVersionId: line.documentVersionId,
        lineId: line.lineId,
        page: line.page,
        periodStart: line.periodStart,
        periodEnd: line.periodEnd,
        source: line.source,
        href: reportHref({ reportType: line.reportType, periodStart: line.periodStart, periodEnd: line.periodEnd }),
      })
    : null;
  const confirmedAction = pending && decision.confirms_pending_action ? pending : null;
  const system: Anthropic.TextBlockParam[] = [
    { type: 'text', text: NICK_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
    {
      type: 'text',
      text: contextBlock({
        entityName: input.entity.name,
        currency: settings.currency,
        locale: input.locale,
        today,
        context,
        selectedLineCite,
        selectedLineFormatted: line ? { current: line.currentCents === null ? null : money(shape, line.currentCents, line.currency), prior: line.priorCents === null ? null : money(shape, line.priorCents, line.currency) } : null,
        pending: pending ? { action: pending, confirmed: confirmedAction !== null } : null,
      }),
    },
  ];

  let pendingThisTurn: PendingAction | null = null;
  const toolContext: ToolContext = {
    supabase,
    admin: () => admin,
    entityId,
    entityName: input.entity.name,
    currency: settings.currency,
    locale: input.locale,
    today,
    userId: input.userId,
    sessionId,
    context,
    registry,
    confirmedAction,
    setPendingAction: (action) => {
      pendingThisTurn = action;
    },
  };

  const role = decision.complexity === 'complex' ? 'reasoning' : 'fast';
  const outcome = await runToolLoop({
    anthropic,
    model: MODELS[role],
    maxTokens: NICK_LIMITS.maxTokens[role],
    effort: NICK_LIMITS.effort[role],
    system,
    tools: toolDefinitions(),
    messages: [...threadToModelMessages(thread, NICK_LIMITS.historyMessages), { role: 'user', content: input.message }],
    runTool: (name, raw) => runTool(name, raw, toolContext),
    registry,
    emit: input.emit,
    maxIterations: NICK_LIMITS.maxToolIterations,
    onToolCall: (call) => {
      void insertToolMessage(admin, { sessionId, entityId, name: call.name, toolInput: call.input, result: call.result, ok: call.ok });
    },
  });

  const messageId = await insertAssistantMessage(admin, {
    sessionId,
    entityId,
    content: { text: outcome.text, citations: outcome.citations, toolCalls: outcome.toolCalls, model: role, pendingAction: pendingThisTurn, usage: outcome.usage },
  });
  if (!messageId) throw new NickError('model_error');
  await Promise.all([
    insertCitations(admin, { entityId, sessionId, messageId, citations: outcome.citations }),
    recordUsage(admin, { entityId, sessionId, day: today, usage: outcome.usage, firstUserText: thread.length === 0 ? input.message : null }),
    logAccess({
      action: 'chat.message.sent',
      resourceType: 'chat_session',
      resourceId: sessionId,
      businessEntityId: entityId,
      metadata: { model: role, tool_calls: outcome.toolCalls.length, citations: outcome.citations.length, input_tokens: outcome.usage.input, output_tokens: outcome.usage.output, retried: outcome.retried },
    }),
  ]);
  input.emit({ type: 'done', messageId, text: outcome.text, citations: outcome.citations, pendingAction: pendingThisTurn });
}
