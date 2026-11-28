// All queries for the `labels` table. See docs/ARCHITECTURE.md, section "Repositories".
import { query } from '../../config/database.js'
import { requireShopId } from '../guard.js'

const columns = 'id, shop_id, name, color, created_at'

export async function list(shopId, db) {
  requireShopId(shopId)
  const { rows } = await query(`SELECT ${columns} FROM labels WHERE shop_id = $1 ORDER BY name`, [shopId], db)
  return rows
}

export async function findById(shopId, id, db) {
  requireShopId(shopId)
  const { rows } = await query(`SELECT ${columns} FROM labels WHERE shop_id = $1 AND id = $2`, [shopId, id], db)
  return rows[0] ?? null
}

export async function create(shopId, { name, color = null }, db) {
  requireShopId(shopId)
  const { rows } = await query(
    `INSERT INTO labels (shop_id, name, color) VALUES ($1, $2, $3) RETURNING ${columns}`,
    [shopId, name, color], db,
  )
  return rows[0]
}

export async function update(shopId, id, patch, db) {
  requireShopId(shopId)
  const allowed = ['name', 'color']
  const entries = Object.entries(patch).filter(([key, value]) => allowed.includes(key) && value !== undefined)
  if (!entries.length) return findById(shopId, id, db)
  const sets = entries.map(([key], i) => `${key} = $${i + 3}`)
  const { rows } = await query(
    `UPDATE labels SET ${sets.join(', ')} WHERE shop_id = $1 AND id = $2 RETURNING ${columns}`,
    [shopId, id, ...entries.map(([, value]) => value)], db,
  )
  return rows[0] ?? null
}

export async function remove(shopId, id, db) {
  requireShopId(shopId)
  const result = await query('DELETE FROM labels WHERE shop_id = $1 AND id = $2', [shopId, id], db)
  return result.rowCount > 0
}

/** Demo copy: labels of the template shop. */
export async function copyFromShop(shopId, templateId, db) {
  await query(
    `INSERT INTO labels (shop_id, name, color) SELECT $1, name, color FROM labels WHERE shop_id = $2`,
    [shopId, templateId], db,
  )
}

/** Demo reset: delete every row of this shop, in the caller's transaction. */
export async function removeAllForShop(shopId, db) {
  requireShopId(shopId)
  await query('DELETE FROM labels WHERE shop_id = $1', [shopId], db)
}
