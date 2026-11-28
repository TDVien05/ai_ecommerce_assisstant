// All queries for the `ai_usage` table. See docs/ARCHITECTURE.md, section "Repositories".
import { query } from '../../config/database.js'
import { requireShopId } from '../guard.js'

export async function record(shopId, { role = null, model = null, promptTokens = 0, completionTokens = 0 }, db) {
  requireShopId(shopId)
  const { rows } = await query(
    `INSERT INTO ai_usage (shop_id, role, model, prompt_tokens, completion_tokens)
     VALUES ($1, $2, $3, $4, $5) RETURNING id, created_at`,
    [shopId, role, model, promptTokens, completionTokens], db,
  )
  return rows[0]
}

/** Token totals since a point in time, per role. */
export async function summarySince(shopId, since = new Date(), db) {
  requireShopId(shopId)
  const { rows } = await query(
    `SELECT role, COUNT(*)::int AS calls,
            COALESCE(SUM(prompt_tokens), 0)::bigint AS prompt_tokens,
            COALESCE(SUM(completion_tokens), 0)::bigint AS completion_tokens
       FROM ai_usage WHERE shop_id = $1 AND created_at >= $2
      GROUP BY role ORDER BY role`,
    [shopId, since], db,
  )
  return rows
}

/** One row per real provider call. shopId may be null (a call outside a shop request). */
export async function recordCall({ shopId = null, role, model, promptTokens = 0, completionTokens = 0 }, db) {
  await query(
    `INSERT INTO ai_usage (shop_id, role, model, prompt_tokens, completion_tokens)
     VALUES ($1, $2, $3, $4, $5)`,
    [shopId ?? null, role, model, promptTokens ?? 0, completionTokens ?? 0], db,
  )
}
