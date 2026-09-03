// A stand-in for the Anthropic Messages API used by the Nick browser specs.
// The Next dev server reaches it through ANTHROPIC_BASE_URL (playwright.config
// starts it when NICK_E2E=1). It is scripted, not smart: it inspects the last
// user turn and the context block and replies the way a well-behaved model
// would — tool calls first, then a short cited answer. Plain Node so it runs
// with `node` type stripping (no path aliases, no non-erasable syntax).
import { createServer } from 'node:http';

type Block = { type: string; text?: string; tool_use_id?: string; content?: string; input?: unknown; name?: string };
type Msg = { role: string; content: string | Block[] };
type Body = { stream?: boolean; system?: string | { text: string }[]; messages?: Msg[] };

const PORT = Number(process.env.ANTHROPIC_MOCK_PORT ?? 4010);
let toolCounter = 0;

function sse(type: string, data: Record<string, unknown>): string {
  return `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`;
}

function streamed(text: string | null, toolUse: { name: string; input: Record<string, unknown> } | null): string {
  let out = sse('message_start', { message: { id: 'msg_mock', type: 'message', role: 'assistant', model: 'mock', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 50, output_tokens: 1 } } });
  let index = 0;
  if (text !== null) {
    out += sse('content_block_start', { index, content_block: { type: 'text', text: '' } });
    out += sse('content_block_delta', { index, delta: { type: 'text_delta', text } });
    out += sse('content_block_stop', { index });
    index += 1;
  }
  if (toolUse) {
    toolCounter += 1;
    out += sse('content_block_start', { index, content_block: { type: 'tool_use', id: `toolu_${toolCounter}`, name: toolUse.name, input: {} } });
    out += sse('content_block_delta', { index, delta: { type: 'input_json_delta', partial_json: JSON.stringify(toolUse.input) } });
    out += sse('content_block_stop', { index });
  }
  out += sse('message_delta', { delta: { stop_reason: toolUse ? 'tool_use' : 'end_turn', stop_sequence: null }, usage: { output_tokens: 20 } });
  out += sse('message_stop', {});
  return out;
}

function systemText(body: Body): string {
  if (typeof body.system === 'string') return body.system;
  return (body.system ?? []).map((block) => block.text).join('\n');
}

function lastToolResult(body: Body): { name: string | null; result: Record<string, unknown> } | null {
  const last = body.messages?.at(-1);
  if (!last || typeof last.content === 'string') return null;
  const block = last.content.find((b) => b.type === 'tool_result');
  if (!block?.content) return null;
  try {
    const result: unknown = JSON.parse(block.content);
    const previous = body.messages?.at(-2);
    const call = previous && typeof previous.content !== 'string' ? previous.content.find((b) => b.type === 'tool_use') : undefined;
    return { name: call?.name ?? null, result: typeof result === 'object' && result !== null ? (result as Record<string, unknown>) : {} };
  } catch {
    return null;
  }
}

function lastUserText(body: Body): string {
  const last = body.messages?.at(-1);
  if (!last) return '';
  return typeof last.content === 'string' ? last.content : last.content.map((b) => b.text ?? '').join(' ');
}

function routerDecision(body: Body): Record<string, unknown> {
  const text = lastUserText(body);
  const hasPending = text.includes('<pending_action>');
  const message = /<user_message>\n([\s\S]*?)\n<\/user_message>/.exec(text)?.[1] ?? '';
  const confirms = hasPending && /^\s*(yes|yes please|sí|si|go ahead|confirm)\b/i.test(message);
  return { complexity: 'simple', tools_likely: [], confirms_pending_action: confirms };
}

function answer(body: Body): string {
  const system = systemText(body);
  const tool = lastToolResult(body);
  if (tool) {
    const r = tool.result;
    console.log(`[mock] tool_result ${tool.name ?? 'unknown'}: ${JSON.stringify(r).slice(0, 240)}`);
    if (tool.name === 'list_available_reports') {
      const documents = Array.isArray(r.documents) ? (r.documents as { documentVersionId?: string | null }[]) : [];
      const versionId = documents.find((d) => d.documentVersionId)?.documentVersionId;
      const confirmed = /Pending confirmation: the user has now confirmed/.test(system);
      if (versionId) return streamed(null, { name: 'get_report_download_link', input: { document_version_id: versionId, confirmed } });
      return streamed('There is no published document to download yet.', null);
    }
    if (r.requires_confirmation === true) return streamed(`I can prepare the download of ${String(r.describe ?? 'that document')}. Do you want me to proceed?`, null);
    if (typeof r.url === 'string') return streamed(`Here is your download link: ${r.url}`, null);
    if (tool.name === 'get_profit_and_loss') {
      const metrics = r.metrics as { netIncome?: { current?: { formatted?: string; cite?: string } | null } } | undefined;
      const current = metrics?.netIncome?.current;
      if (current?.formatted && current.cite) return streamed(`Net income for the period was **${current.formatted}** [${current.cite}].`, null);
      return streamed('The statement does not print a net income total, so I cannot quote one.', null);
    }
    return streamed('I checked, but that information is not available.', null);
  }

  const text = lastUserText(body);
  const cite = /Cite it as \[(c\d+)\]/.exec(system)?.[1];
  const line = /Selected line: "([^"]+)" on the (.+?) for (\S+) to (\S+)(?:, page (\d+))?: (.+?)(?:, prior column|\. Cite it)/.exec(system);
  if (cite && line) {
    const [, name, , , , page, amount] = line;
    return streamed(`"${name}" is the amount printed on your statement${page ? ` on page ${page}` : ''}: ${amount} [${cite}]. It is one line of the published report, not a computed figure.`, null);
  }
  const pending = /Pending confirmation: the user has now confirmed "(.+?)"\. You may call (\w+) with confirmed: true/.exec(system);
  if (pending) return streamed(null, { name: 'list_available_reports', input: { report_type: null } });
  if (/download|descarg/i.test(text)) return streamed(null, { name: 'list_available_reports', input: { report_type: null } });
  if (/net income|how is|doing|utilidad/i.test(text)) return streamed(null, { name: 'get_profit_and_loss', input: { period: null, detail: 'summary', query: null } });
  return streamed('I can explain any figure on your published statements. What would you like to know?', null);
}

const server = createServer((request, response) => {
  if (request.method === 'GET' && request.url === '/health') {
    response.writeHead(200, { 'Content-Type': 'text/plain' }).end('ok');
    return;
  }
  if (request.method !== 'POST' || !request.url?.endsWith('/messages')) {
    response.writeHead(404).end();
    return;
  }
  let raw = '';
  request.on('data', (chunk: Buffer) => {
    raw += chunk.toString('utf8');
  });
  request.on('end', () => {
    let body: Body = {};
    try {
      body = JSON.parse(raw) as Body;
    } catch {
      response.writeHead(400).end();
      return;
    }
    if (body.stream) {
      response.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store' });
      response.end(answer(body));
      return;
    }
    const decision = routerDecision(body);
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(
      JSON.stringify({
        id: 'msg_router',
        type: 'message',
        role: 'assistant',
        model: 'mock',
        content: [{ type: 'text', text: JSON.stringify(decision) }],
        stop_reason: 'end_turn',
        stop_sequence: null,
        stop_details: null,
        usage: { input_tokens: 30, output_tokens: 10 },
      }),
    );
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`anthropic mock listening on http://127.0.0.1:${PORT}`);
});
