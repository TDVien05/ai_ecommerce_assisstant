import { pool } from '../pool.js'
import { requireShopId } from './guard.js'

export async function record(shopId, { role = null, model = null, promptTokens = 0, completionTokens = 0 }, db = pool) {
  requireShopId(shopId)
  const { rows } = await db.query(
    `INSERT INTO ai_usage (shop_id, role, model, prompt_tokens, completion_tokens)
     VALUES ($1, $2, $3, $4, $5) RETURNING id, created_at`,
    [shopId, role, model, promptTokens, completionTokens],
  )
  return rows[0]
}

/** Token totals since a point in time, per role. */
export async function summarySince(shopId, since = new Date(), db = pool) {
  requireShopId(shopId)
  const { rows } = await db.query(
    `SELECT role, COUNT(*)::int AS calls,
            COALESCE(SUM(prompt_tokens), 0)::bigint AS prompt_tokens,
            COALESCE(SUM(completion_tokens), 0)::bigint AS completion_tokens
       FROM ai_usage WHERE shop_id = $1 AND created_at >= $2
      GROUP BY role ORDER BY role`,
    [shopId, since],
  )
  return rows
}
