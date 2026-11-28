// Scripted stand-in for client.js, used when AI_MOCK=true. Never calls the provider.
// Default: answers in text without calling tools. Tests can queue exact replies with
// setMockReplies([...]) — each reply is an assistant message ({ content } or { tool_calls }).

import { readFileSync } from 'node:fs'

let queue = []
// A scenario file is deliberately available only in a non-production mock process.
if (process.env.AI_MOCK === 'true' && process.env.NODE_ENV !== 'production' && process.env.AI_MOCK_SCRIPT) {
  const replies = JSON.parse(readFileSync(process.env.AI_MOCK_SCRIPT, 'utf8'))
  if (!Array.isArray(replies)) throw new Error('AI_MOCK_SCRIPT must contain an array')
  queue = replies
}

/** Queue assistant messages to return in order (tests only). */
export function setMockReplies(replies) {
  queue = [...replies]
}

function lastUserText(messages) {
  const last = [...messages].reverse().find((m) => m.role === 'user')
  if (!last) return ''
  if (typeof last.content === 'string') return last.content
  return (last.content ?? []).filter((p) => p.type === 'text').map((p) => p.text).join(' ')
}

/** Same signature and return shape as client.chat. */
export async function chat({ role, messages }) {
  const scripted = queue.shift()
  if (process.env.NODE_ENV === 'test' && process.env.AI_MOCK === 'true' && process.env.AI_MOCK_SCRIPT && Number.isFinite(scripted?.delayMs)) {
    await new Promise((resolve) => setTimeout(resolve, Math.min(30000, Math.max(0, scripted.delayMs))))
  }
  const message = scripted
    ? { role: 'assistant', content: scripted.content ?? null, ...(scripted.tool_calls ? { tool_calls: scripted.tool_calls } : {}) }
    : { role: 'assistant', content: `[AI giả lập] Đã nhận: ${lastUserText(messages).slice(0, 80)}` }
  return {
    message,
    finishReason: message.tool_calls ? 'tool_calls' : 'stop',
    model: `mock-${role}`,
    usage: { promptTokens: 0, completionTokens: 0 },
  }
}
