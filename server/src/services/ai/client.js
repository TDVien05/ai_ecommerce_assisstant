// Real provider client: POST {AI_BASE_URL}/chat/completions over fetch, no SDK.
// Works with any OpenAI-compatible endpoint; the team uses OpenRouter
// (AI_BASE_URL=https://openrouter.ai/api/v1). The only file allowed to call the provider.
import { env } from '../../config/env.js'
import { logger } from '../../lib/logger.js'
import { isConfigured, modelFor } from './config.js'
import { AiUnavailableError } from './errors.js'
import { recordUsage } from './usage.js'

const MAX_RETRIES = 2
const BACKOFF_MS = [500, 1500]
const MAX_RETRY_AFTER_MS = 5000

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const isRetryable = (status) => status === 429 || (status >= 500 && status <= 599)

function retryDelay(attempt, response) {
  const header = Number(response?.headers?.get('retry-after'))
  if (Number.isFinite(header) && header > 0) return Math.min(header * 1000, MAX_RETRY_AFTER_MS)
  return BACKOFF_MS[attempt] ?? BACKOFF_MS.at(-1)
}

/**
 * One chat completion.
 * @param {object} opts
 * @param {'agent'|'bot'|'classify'|'vision'|'fraud'} opts.role  picks the model (AI_MODEL_<ROLE> → AI_MODEL)
 * @param {Array} opts.messages        OpenAI-format messages (content may be a string or parts with image_url)
 * @param {Array} [opts.tools]         OpenAI-format tool definitions
 * @param {'auto'|'none'|'required'} [opts.toolChoice]
 * @param {object} [opts.responseFormat]  e.g. { type: 'json_object' }
 * @param {number} [opts.temperature]
 * @param {number} [opts.maxTokens]
 * @param {{ shopId?: string }} [opts.ctx]  used for ai_usage accounting
 * @param {AbortSignal} [opts.signal]
 * @returns {Promise<{ message: object, finishReason: string, model: string, usage: { promptTokens: number, completionTokens: number } }>}
 * @throws {AiUnavailableError} no key, timeout, provider error, or retries exhausted
 */
export async function chat({ role, messages, tools, toolChoice, responseFormat, temperature, maxTokens, ctx = {}, signal }) {
  if (!isConfigured()) throw new AiUnavailableError('not_configured')
  const model = modelFor(role)

  const body = {
    model,
    messages,
    ...(tools?.length ? { tools, tool_choice: toolChoice ?? 'auto' } : {}),
    ...(responseFormat ? { response_format: responseFormat } : {}),
    ...(temperature !== undefined ? { temperature } : {}),
    ...(maxTokens !== undefined ? { max_tokens: maxTokens } : {}),
  }

  for (let attempt = 0; ; attempt++) {
    let response
    let payload
    try {
      const timeout = AbortSignal.timeout(env.AI_TIMEOUT_MS)
      response = await fetch(`${env.AI_BASE_URL.replace(/\/+$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.AI_API_KEY}`,
          'Content-Type': 'application/json',
          // OpenRouter app attribution headers; ignored by other providers.
          'X-Title': 'Flowy',
        },
        body: JSON.stringify(body),
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      })
      payload = await response.json().catch(() => null)
    } catch (err) {
      if (signal?.aborted) throw err // caller cancelled: not an AI outage
      if (err.name === 'TimeoutError') throw new AiUnavailableError('timeout', { cause: err })
      if (attempt < MAX_RETRIES) {
        await sleep(retryDelay(attempt))
        continue
      }
      throw new AiUnavailableError('network', { cause: err })
    }

    // OpenRouter may answer 200 with an { error } body when the upstream model fails.
    const status = response.ok && payload?.error ? Number(payload.error.code) || 502 : response.status
    if (response.ok && !payload?.error && payload?.choices?.length) {
      const choice = payload.choices[0]
      const usage = {
        promptTokens: payload.usage?.prompt_tokens ?? 0,
        completionTokens: payload.usage?.completion_tokens ?? 0,
      }
      await recordUsage({ shopId: ctx.shopId, role, model: payload.model ?? model, ...usage })
      return { message: choice.message, finishReason: choice.finish_reason, model: payload.model ?? model, usage }
    }

    if (isRetryable(status) && attempt < MAX_RETRIES) {
      logger.warn({ role, model, status, attempt: attempt + 1 }, 'AI provider error, retrying')
      await sleep(retryDelay(attempt, response))
      continue
    }

    // Provider error bodies are untrusted and may echo user input or credentials.
    logger.error({ role, model, status }, 'AI provider request failed')
    throw new AiUnavailableError(response.ok ? 'empty_response' : `http_${status}`, { status })
  }
}
