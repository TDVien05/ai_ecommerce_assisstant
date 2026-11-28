import { pool } from '../pool.js'
import { requireShopId } from './guard.js'

const columns = 'id, shop_id, provider, external_id, level, rule, reason, metadata, created_at'

/**
 * One row per check. `shopId` may be null when the shop is still unknown
 * (for example a webhook with a bad signature), so it is not passed to requireShopId.
 */
export async function record(shopId, { provider = null, externalId = null, level, rule, reason = null, metadata = {} }, db = pool) {
  if (shopId !== null && shopId !== undefined) requireShopId(shopId)
  const { rows } = await db.query(
    `INSERT INTO fraud_checks (shop_id, provider, external_id, level, rule, reason, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING ${columns}`,
    [shopId ?? null, provider, externalId, level, rule, reason, metadata],
  )
  return rows[0]
}

export async function list(shopId, { level, limit = 100, offset = 0 } = {}, db = pool) {
  requireShopId(shopId)
  const params = [shopId]
  let where = 'shop_id = $1'
  if (level) {
    params.push(level)
    where += ` AND level = $${params.length}`
  }
  params.push(limit, offset)
  const { rows } = await db.query(
    `SELECT ${columns} FROM fraud_checks WHERE ${where}
      ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  )
  return rows
}
