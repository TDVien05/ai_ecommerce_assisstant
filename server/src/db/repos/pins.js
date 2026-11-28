import { pool } from '../pool.js'
import { requireShopId } from './guard.js'

const columns = 'id, shop_id, kind, ref_id, created_at'

export async function list(shopId, db = pool) {
  requireShopId(shopId)
  const { rows } = await db.query(`SELECT ${columns} FROM pins WHERE shop_id = $1 ORDER BY created_at DESC`, [shopId])
  return rows
}

export async function add(shopId, { kind, refId }, db = pool) {
  requireShopId(shopId)
  const { rows } = await db.query(
    `INSERT INTO pins (shop_id, kind, ref_id) VALUES ($1, $2, $3)
     ON CONFLICT (shop_id, kind, ref_id) DO UPDATE SET kind = EXCLUDED.kind
     RETURNING ${columns}`,
    [shopId, kind, refId],
  )
  return rows[0]
}

export async function remove(shopId, id, db = pool) {
  requireShopId(shopId)
  const result = await db.query('DELETE FROM pins WHERE shop_id = $1 AND id = $2', [shopId, id])
  return result.rowCount > 0
}
