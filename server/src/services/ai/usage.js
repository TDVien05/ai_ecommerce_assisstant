import { pool } from '../../db/pool.js'
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
    await pool.query(
      `INSERT INTO ai_usage (shop_id, role, model, prompt_tokens, completion_tokens)
       VALUES ($1, $2, $3, $4, $5)`,
      [shopId ?? null, role, model, promptTokens ?? 0, completionTokens ?? 0],
    )
  } catch (err) {
    if (err.code === '42P01') {
      if (!tableMissingLogged) logger.warn('ai_usage table missing, AI token usage is not recorded yet')
      tableMissingLogged = true
      return
    }
    logger.warn({ code: err.code, message: err.message }, 'Failed to record AI usage')
  }
}
