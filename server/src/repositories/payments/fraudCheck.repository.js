// All queries for the `fraud_checks` table. See docs/ARCHITECTURE.md, section "Repositories".
import { query } from '../../config/database.js'
import { requireShopId } from '../guard.js'

const columns = 'id, shop_id, provider, external_id, level, rule, reason, metadata, created_at'

/**
 * One row per check. `shopId` may be null when the shop is still unknown
 * (for example a webhook with a bad signature), so it is not passed to requireShopId.
 */
export async function record(shopId, { provider = null, externalId = null, level, rule, reason = null, metadata = {} }, db) {
  if (shopId !== null && shopId !== undefined) requireShopId(shopId)
  const { rows } = await query(
    `INSERT INTO fraud_checks (shop_id, provider, external_id, level, rule, reason, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING ${columns}`,
    [shopId ?? null, provider, externalId, level, rule, reason, metadata], db,
  )
  return rows[0]
}

export async function list(shopId, { level, limit = 100, offset = 0 } = {}, db) {
  requireShopId(shopId)
  const params = [shopId]
  let where = 'shop_id = $1'
  if (level) {
    params.push(level)
    where += ` AND level = $${params.length}`
  }
  params.push(limit, offset)
  const { rows } = await query(
    `SELECT ${columns} FROM fraud_checks WHERE ${where}
      ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params, db,
  )
  return rows
}

/** Demo copy: fraud checks, shifted by `interval`. */
export async function copyFromShop(shopId, templateId, interval, db) {
  await query(
    `INSERT INTO fraud_checks (shop_id, provider, external_id, level, rule, reason, metadata, created_at)
     SELECT $1, provider, external_id, level, rule, reason, metadata, created_at + $3::interval
       FROM fraud_checks WHERE shop_id = $2`,
    [shopId, templateId, interval], db,
  )
}

/** Demo reset: delete every row of this shop, in the caller's transaction. */
export async function removeAllForShop(shopId, db) {
  requireShopId(shopId)
  await query('DELETE FROM fraud_checks WHERE shop_id = $1', [shopId], db)
}
