// All queries for the `pins` table. See docs/ARCHITECTURE.md, section "Repositories".
import { query } from '../../config/database.js'
import { requireShopId } from '../guard.js'

const columns = 'id, shop_id, kind, ref_id, created_at'

export async function list(shopId, db) {
  requireShopId(shopId)
  const { rows } = await query(`SELECT ${columns} FROM pins WHERE shop_id = $1 ORDER BY created_at DESC`, [shopId], db)
  return rows
}

export async function add(shopId, { kind, refId }, db) {
  requireShopId(shopId)
  const { rows } = await query(
    `INSERT INTO pins (shop_id, kind, ref_id) VALUES ($1, $2, $3)
     ON CONFLICT (shop_id, kind, ref_id) DO UPDATE SET kind = EXCLUDED.kind
     RETURNING ${columns}`,
    [shopId, kind, refId], db,
  )
  return rows[0]
}

export async function remove(shopId, id, db) {
  requireShopId(shopId)
  const result = await query('DELETE FROM pins WHERE shop_id = $1 AND id = $2', [shopId, id], db)
  return result.rowCount > 0
}
