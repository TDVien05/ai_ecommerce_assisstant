import { recordCall } from '../../repositories/ai/aiUsage.repository.js'
import { logger } from '../../lib/logger.js'

let tableMissingLogged = false

/**
 * Write one ai_usage row per real provider call. Never throws: usage accounting must not
 * break an AI answer.
 * TODO(B6): the ai_usage table belongs to Thịnh's migration. Until it exists, inserts fail
 * with 42P01 and are skipped with a single warning. Align the column list once it lands.
 */
export async function recordUsage({ shopId, role, model, promptTokens, completionTokens }) {
  try {
    await recordCall({ shopId, role, model, promptTokens, completionTokens })
  } catch (err) {
    if (err.code === '42P01') {
      if (!tableMissingLogged) logger.warn('ai_usage table missing, AI token usage is not recorded yet')
      tableMissingLogged = true
      return
    }
    logger.warn({ code: err.code, message: err.message }, 'Failed to record AI usage')
  }
}
