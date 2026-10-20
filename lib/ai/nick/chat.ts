// One Nick turn (spec §10 "Loop"): rate limit and budget → session → persist
// the user message → resolve the page context from the database → route →
// stream the tool loop → persist the answer, its citations and the usage →
// audit. Everything tenant-scoped is derived from the verified session.
import type Anthropic from '@anthropic-ai/sdk';
import 'server-only';

import { MODELS, getAnthropic } from '@/lib/ai/client';
import { logAccess } from '@/lib/audit/logAccess';
import type { CurrentEntity } from '@/lib/auth/getCurrentEntity';
import {
  loadPortalEntitySettings,
  loadPublishedBankStatements,
  loadPublishedReports,
} from '@/lib/portal/load';
import { RATE_LIMITS, consumeRateLimit } from '@/lib/rate-limit';
import { todayIn } from '@/lib/utils/timezone';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

import { CitationRegistry, citationLabel } from './citations';
import { NICK_LIMITS, dailyTokenBudget } from './config';
import { runToolLoop } from './loop';
import {
  createSession,
  ensureSessionTitle,
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
import {
  type NickLocale,
  type ToolContext,
  label,
  money,
  reportHref,
  statementLabel,
} from './tools/context';
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
  /** Aborted when the client goes away or the turn runs out of time (app/api/chat/route.ts). */
  signal?: AbortSignal;
};

export async function runNickTurn(input: TurnInput): Promise<void> {
  if (input.entity.role === 'firm_preview') throw new NickError('preview_not_supported');

  const supabase = await createClient();
  const admin = createAdminClient();
  const entityId = input.entity.id;
  // The budget is a system quota and rolls on the server's UTC day; what Nick
  // is *told* the date is must be the business's own calendar (migration 0010),
  // or it will call a reminder due today overdue for anyone west of UTC.
  const budgetDay = new Date().toISOString().slice(0, 10);

  // Every check and every read that needs only the business, in one wave: the
  // rate limit, the budget, the session the client named, and what the page
  // context and the tools are resolved from. These used to run one after
  // another before Nick could start. Nothing is written until the checks pass.
  const [allowed, usedToday, named, settings, reports, statements] = await Promise.all([
    consumeRateLimit(`chat:${input.userId}`, RATE_LIMITS.chat),
    usedTokensToday(admin, entityId, budgetDay),
    input.sessionId ? loadSession(supabase, entityId, input.userId, input.sessionId) : Promise.resolve(null),
    loadPortalEntitySettings(supabase, entityId),
    loadPublishedReports(supabase, entityId),
    loadPublishedBankStatements(supabase, entityId),
  ]);
  if (!allowed) throw new NickError('rate_limited');
  if (usedToday >= dailyTokenBudget()) throw new NickError('budget_exhausted');

  const sessionId = input.sessionId ? (named?.id ?? null) : await createSession(supabase, entityId, input.userId);
  if (!sessionId) throw new NickError('invalid_request');
  input.emit({ type: 'session', sessionId });

  // Only the turns the model is sent (and the pending action, which is the
  // last of them); a new session has none to read.
  const thread = input.sessionId ? await loadThread(supabase, sessionId, { latest: NICK_LIMITS.historyMessages }) : [];
  const pending = lastPendingAction(thread);

  // Every model call's tokens, the router's included, counted as they are
  // spent: a turn that fails after calling the model has still used them.
  const usage = { input: 0, output: 0 };
  const count = (spent: { input: number; output: number }) => {
    usage.input += spent.input;
    usage.output += spent.output;
  };
  const recordSpent = () =>
    recordUsage(admin, {
      entityId,
      sessionId,
      day: budgetDay,
      usage: { ...usage },
      firstUserText: thread.length === 0 ? input.message : null,
    });
  let recorded = false;

  try {
    const anthropic = getAnthropic();
    const [userMessageId, , context, decision] = await Promise.all([
      insertUserMessage(admin, { sessionId, entityId, text: input.message }),
      thread.length === 0 ? ensureSessionTitle(admin, { sessionId, text: input.message }) : Promise.resolve(),
      resolveContext(supabase, entityId, input.locale, input.context, { reports, statements }),
      routeMessage(
        anthropic,
        MODELS.fast,
        { message: input.message, pendingActionLabel: pending?.label ?? null },
        count,
      ),
    ]);
    // The question is part of the record; an answer to a question that was not
    // saved would read as Nick talking to himself.
    if (!userMessageId) throw new NickError('model_error');

    const registry = new CitationRegistry();
    const today = todayIn(settings.timezone);
    const shape = { locale: input.locale, currency: settings.currency, registry };
    const line = context.line;
    const selectedLineCite = line
      ? registry.add({
          label: citationLabel([
            statementLabel(input.locale, line.reportType),
            periodText(line.periodStart, line.periodEnd, input.locale),
            line.page ? `${label(input.locale, 'page')} ${line.page}` : null,
            line.accountName,
          ]),
          reportId: line.reportId,
          documentVersionId: line.documentVersionId,
          lineId: line.lineId,
          page: line.page,
          periodStart: line.periodStart,
          periodEnd: line.periodEnd,
          source: line.source,
          href: reportHref({
            reportType: line.reportType,
            periodStart: line.periodStart,
            periodEnd: line.periodEnd,
          }),
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
          selectedLineFormatted: line
            ? {
                current:
                  line.currentCents === null ? null : money(shape, line.currentCents, line.currency),
                prior: line.priorCents === null ? null : money(shape, line.priorCents, line.currency),
              }
            : null,
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
      tools: toolDefinitions(settings.modules),
      messages: [
        ...threadToModelMessages(thread, NICK_LIMITS.historyMessages),
        { role: 'user', content: input.message },
      ],
      runTool: (name, raw) => runTool(name, raw, toolContext),
      registry,
      emit: input.emit,
      maxIterations: NICK_LIMITS.maxToolIterations,
      onToolCall: (call) => {
        void insertToolMessage(admin, {
          sessionId,
          entityId,
          name: call.name,
          toolInput: call.input,
          result: call.result,
          ok: call.ok,
        });
      },
      onUsage: count,
      ...(input.signal ? { signal: input.signal } : {}),
    });

    const messageId = await insertAssistantMessage(admin, {
      sessionId,
      entityId,
      content: {
        text: outcome.text,
        citations: outcome.citations,
        toolCalls: outcome.toolCalls,
        model: role,
        pendingAction: pendingThisTurn,
        usage: outcome.usage,
      },
    });
    if (!messageId) throw new NickError('model_error');

    // The answer goes out first. What is left is bookkeeping the reader does
    // not wait on, and none of it throws: the citations (already in the stored
    // message), the usage and the audit row.
    input.emit({
      type: 'done',
      messageId,
      text: outcome.text,
      citations: outcome.citations,
      pendingAction: pendingThisTurn,
    });
    recorded = true;
    await Promise.all([
      insertCitations(admin, { entityId, sessionId, messageId, citations: outcome.citations }),
      recordSpent(),
      logAccess({
        action: 'chat.message.sent',
        resourceType: 'chat_session',
        resourceId: sessionId,
        businessEntityId: entityId,
        metadata: {
          model: role,
          tool_calls: outcome.toolCalls.length,
          citations: outcome.citations.length,
          input_tokens: usage.input,
          output_tokens: usage.output,
          retried: outcome.retried,
        },
      }),
    ]);
  } finally {
    // A refused, truncated, uncited or cut-off answer was still paid for.
    if (!recorded && (usage.input > 0 || usage.output > 0)) await recordSpent();
  }
}
