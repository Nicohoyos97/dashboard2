// The streaming tool-use loop (spec §10): stream text, execute tool calls in
// parallel, feed results back, stop at the iteration cap, and refuse to
// return an answer whose figures are not cited. Pure with respect to the
// database: callers inject `runTool` and `emit`, so the loop is tested with
// the Messages API mocked at the HTTP layer.
import type Anthropic from '@anthropic-ai/sdk';

import type { Effort } from '@/lib/ai/models';

import { type CitationRegistry, checkAnswer } from './citations';
import { CITATION_RETRY_MESSAGE } from './prompts';
import type { ToolDefinition } from './tools/schemas';
import { type CitationRecord, NickError, type NickEvent } from './types';

export type ToolRunner = (
  name: string,
  input: unknown,
) => Promise<{ ok: boolean; result: unknown }>;

export type LoopParams = {
  anthropic: Anthropic;
  model: string;
  maxTokens: number;
  effort: Effort;
  system: Anthropic.TextBlockParam[];
  tools: ToolDefinition[];
  messages: Anthropic.MessageParam[];
  runTool: ToolRunner;
  registry: CitationRegistry;
  emit: (event: NickEvent) => void;
  maxIterations: number;
  onToolCall?: (call: { name: string; input: unknown; result: unknown; ok: boolean }) => void;
};

export type LoopOutcome = {
  text: string;
  citations: CitationRecord[];
  usage: { input: number; output: number };
  toolCalls: { name: string; ok: boolean }[];
  retried: boolean;
};

function textOf(message: Anthropic.Message): string {
  return message.content
    .flatMap((block) => (block.type === 'text' ? [block.text] : []))
    .join('')
    .trim();
}

function countUsage(usage: Anthropic.Usage): { input: number; output: number } {
  return {
    input:
      usage.input_tokens +
      (usage.cache_creation_input_tokens ?? 0) +
      (usage.cache_read_input_tokens ?? 0),
    output: usage.output_tokens,
  };
}

export async function runToolLoop(params: LoopParams): Promise<LoopOutcome> {
  const messages = [...params.messages];
  const usage = { input: 0, output: 0 };
  const toolCalls: LoopOutcome['toolCalls'] = [];
  let retried = false;

  for (let iteration = 0; iteration < params.maxIterations; iteration += 1) {
    const last = iteration === params.maxIterations - 1;
    const stream = params.anthropic.messages.stream({
      model: params.model,
      max_tokens: params.maxTokens,
      system: params.system,
      tools: params.tools,
      messages,
      output_config: { effort: params.effort },
      // The final allowed iteration must answer: no further tool calls.
      ...(last ? { tool_choice: { type: 'none' as const } } : {}),
    });
    stream.on('text', (delta) => params.emit({ type: 'delta', text: delta }));

    let message: Anthropic.Message;
    try {
      message = await stream.finalMessage();
    } catch (error) {
      console.error('[nick] model call failed:', error instanceof Error ? error.name : 'unknown');
      throw new NickError('model_error');
    }
    const turnUsage = countUsage(message.usage);
    usage.input += turnUsage.input;
    usage.output += turnUsage.output;

    if (message.stop_reason === 'refusal') throw new NickError('refusal');

    if (message.stop_reason === 'tool_use') {
      const toolUses = message.content.filter(
        (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
      );
      // Interim prose ("let me check…") is cleared so only the final answer stays on screen.
      params.emit({ type: 'reset' });
      messages.push({ role: 'assistant', content: message.content });
      const results = await Promise.all(
        toolUses.map(async (use): Promise<Anthropic.ToolResultBlockParam> => {
          params.emit({ type: 'status', tool: use.name });
          const { ok, result } = await params.runTool(use.name, use.input);
          toolCalls.push({ name: use.name, ok });
          params.onToolCall?.({ name: use.name, input: use.input, result, ok });
          return {
            type: 'tool_result',
            tool_use_id: use.id,
            content: JSON.stringify(result),
            ...(ok ? {} : { is_error: true }),
          };
        }),
      );
      messages.push({ role: 'user', content: results });
      continue;
    }

    const text = textOf(message);
    const check = checkAnswer(text, params.registry);
    if (check.ok) return { text, citations: check.citations, usage, toolCalls, retried };

    if (retried) throw new NickError('uncited_answer');
    retried = true;
    params.emit({ type: 'reset' });
    messages.push({ role: 'assistant', content: message.content });
    messages.push({ role: 'user', content: CITATION_RETRY_MESSAGE });
  }

  throw new NickError('model_error');
}
