import { z } from 'zod'
import { logger } from '../../lib/logger.js'
import { MAX_ROUNDS } from './config.js'

/**
 * Convert app tools to OpenAI tool definitions.
 * A tool is { name, description, schema: zod object, run(input, ctx) }.
 */
export function toOpenAiTools(tools) {
  return tools.map(({ name, description, schema }) => {
    const { $schema, ...parameters } = z.toJSONSchema(schema) // some providers reject $schema
    return { type: 'function', function: { name, description, parameters } }
  })
}

function parseArgs(raw) {
  if (raw === undefined || raw === null || raw === '') return {}
  if (typeof raw === 'object') return raw
  return JSON.parse(raw)
}

const toolMessage = (id, content) => ({
  role: 'tool',
  tool_call_id: id,
  content: typeof content === 'string' ? content : JSON.stringify(content),
})

async function executeToolCall(call, byName, ctx) {
  const name = call.function?.name
  const tool = byName.get(name)
  if (!tool) return { ok: false, output: { error: `Công cụ "${name}" không tồn tại.` } }

  let args
  try {
    args = parseArgs(call.function.arguments)
  } catch {
    return { ok: false, output: { error: 'Tham số không phải JSON hợp lệ. Hãy gọi lại với JSON đúng.' } }
  }

  // Invalid input goes back to the model so it can ask the user or retry (docs/AI_AGENT.md).
  const parsed = tool.schema.safeParse(args)
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }))
    return { ok: false, input: args, output: { error: 'Tham số không hợp lệ.', issues } }
  }

  try {
    return { ok: true, input: parsed.data, output: await tool.run(parsed.data, ctx) }
  } catch (err) {
    // Business errors (HttpError) are shown to the model; unexpected ones are logged and hidden.
    if (err.status && err.status < 500) return { ok: false, input: parsed.data, output: { error: err.message, code: err.code } }
    logger.error({ err, tool: name }, 'AI tool failed')
    return { ok: false, input: parsed.data, output: { error: 'Công cụ gặp lỗi nội bộ.' } }
  }
}

/**
 * Run the model with tools until it answers in text or maxRounds is reached.
 * Provider failures surface as AiUnavailableError (from `chat`); callers switch to rule mode.
 *
 * @param {object} opts
 * @param {Function} opts.chat           chat implementation (real client or mock)
 * @param {string} opts.role             'agent' | 'bot' | ...
 * @param {Array} opts.messages          initial messages (system + history + user)
 * @param {Array} [opts.tools]           app tools { name, description, schema, run }
 * @param {number} [opts.maxRounds]      defaults to MAX_ROUNDS[role]
 * @param {object} [opts.ctx]            passed to every tool.run; holds shopId etc. — never from the model
 * @param {AbortSignal} [opts.signal]
 * @returns {Promise<{ text: string, messages: Array, toolCalls: Array, rounds: number, stopReason: 'answer'|'max_rounds' }>}
 */
export async function runToolLoop({ chat, role, messages, tools = [], maxRounds, ctx = {}, signal }) {
  const limit = maxRounds ?? MAX_ROUNDS[role] ?? 5
  const openAiTools = toOpenAiTools(tools)
  const byName = new Map(tools.map((t) => [t.name, t]))
  const history = [...messages]
  const toolCalls = []

  for (let round = 1; round <= limit; round++) {
    const { message } = await chat({ role, messages: history, tools: openAiTools, ctx, signal })
    history.push({ role: 'assistant', content: message.content ?? null, ...(message.tool_calls?.length ? { tool_calls: message.tool_calls } : {}) })

    if (!message.tool_calls?.length) {
      return { text: message.content ?? '', messages: history, toolCalls, rounds: round, stopReason: 'answer' }
    }

    for (const call of message.tool_calls) {
      const result = await executeToolCall(call, byName, ctx)
      toolCalls.push({ name: call.function?.name, input: result.input, ok: result.ok, output: result.output })
      history.push(toolMessage(call.id, result.output))
    }
  }

  // Out of rounds: ask for a final answer without tools so the user still gets a reply.
  const { message } = await chat({ role, messages: history, tools: openAiTools, toolChoice: 'none', ctx, signal })
  history.push({ role: 'assistant', content: message.content ?? '' })
  return { text: message.content ?? '', messages: history, toolCalls, rounds: limit, stopReason: 'max_rounds' }
}
