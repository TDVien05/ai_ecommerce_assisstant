import { HttpError } from '../../lib/httpError.js'

export const AI_UNAVAILABLE = 'AI_UNAVAILABLE'

/**
 * Thrown whenever the AI cannot answer: no key, timeout, provider error, exhausted retries.
 * Callers catch it (isAiUnavailable) and switch to rule mode.
 * `reason` is safe to log; it never contains the API key or prompt content.
 */
export class AiUnavailableError extends HttpError {
  constructor(reason, { cause, status } = {}) {
    super(503, AI_UNAVAILABLE, 'AI tạm thời không khả dụng.')
    this.name = 'AiUnavailableError'
    this.reason = reason
    this.providerStatus = status
    if (cause) this.cause = cause
  }
}

export const isAiUnavailable = (err) => err?.code === AI_UNAVAILABLE
