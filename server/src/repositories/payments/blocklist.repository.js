// All queries for the `blocklist` table. See docs/ARCHITECTURE.md, section "Repositories".
import { query } from '../../config/database.js'
import { requireShopId } from '../guard.js'

const columns = 'id, shop_id, kind, value, reason, created_at'

export async function list(shopId, db) {
  requireShopId(shopId)
  const { rows } = await query(`SELECT ${columns} FROM blocklist WHERE shop_id = $1 ORDER BY created_at DESC`, [shopId], db)
  return rows
}

export async function isBlocked(shopId, kind, value, db) {
  requireShopId(shopId)
  if (!value) return null
  const { rows } = await query(
    `SELECT ${columns} FROM blocklist WHERE shop_id = $1 AND kind = $2 AND value = $3`,
    [shopId, kind, value], db,
  )
  return rows[0] ?? null
}

export async function add(shopId, { kind, value, reason = null }, db) {
  requireShopId(shopId)
  const { rows } = await query(
    `INSERT INTO blocklist (shop_id, kind, value, reason) VALUES ($1, $2, $3, $4)
     ON CONFLICT (shop_id, kind, value) DO UPDATE SET reason = COALESCE(EXCLUDED.reason, blocklist.reason)
     RETURNING ${columns}`,
    [shopId, kind, value, reason], db,
  )
  return rows[0]
}

export async function remove(shopId, id, db) {
  requireShopId(shopId)
  const result = await query('DELETE FROM blocklist WHERE shop_id = $1 AND id = $2', [shopId, id], db)
  return result.rowCount > 0
}

/** Demo copy: blocklist of the template shop. */
export async function copyFromShop(shopId, templateId, db) {
  await query(
    `INSERT INTO blocklist (shop_id, kind, value, reason) SELECT $1, kind, value, reason FROM blocklist WHERE shop_id = $2`,
    [shopId, templateId], db,
  )
}

/** Demo reset: delete every row of this shop, in the caller's transaction. */
export async function removeAllForShop(shopId, db) {
  requireShopId(shopId)
  await query('DELETE FROM blocklist WHERE shop_id = $1', [shopId], db)
}
