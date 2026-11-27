import { pool } from '../pool.js'
import { requireShopId } from './guard.js'

const columns = 'id, shop_id, kind, value, reason, created_at'

export async function list(shopId, db = pool) {
  requireShopId(shopId)
  const { rows } = await db.query(`SELECT ${columns} FROM blocklist WHERE shop_id = $1 ORDER BY created_at DESC`, [shopId])
  return rows
}

export async function isBlocked(shopId, kind, value, db = pool) {
  requireShopId(shopId)
  if (!value) return null
  const { rows } = await db.query(
    `SELECT ${columns} FROM blocklist WHERE shop_id = $1 AND kind = $2 AND value = $3`,
    [shopId, kind, value],
  )
  return rows[0] ?? null
}

export async function add(shopId, { kind, value, reason = null }, db = pool) {
  requireShopId(shopId)
  const { rows } = await db.query(
    `INSERT INTO blocklist (shop_id, kind, value, reason) VALUES ($1, $2, $3, $4)
     ON CONFLICT (shop_id, kind, value) DO UPDATE SET reason = COALESCE(EXCLUDED.reason, blocklist.reason)
     RETURNING ${columns}`,
    [shopId, kind, value, reason],
  )
  return rows[0]
}

export async function remove(shopId, id, db = pool) {
  requireShopId(shopId)
  const result = await db.query('DELETE FROM blocklist WHERE shop_id = $1 AND id = $2', [shopId, id])
  return result.rowCount > 0
}
