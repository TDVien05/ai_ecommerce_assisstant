import { pool } from '../pool.js'
import { requireShopId } from './guard.js'

const columns = 'id, shop_id, name, color, created_at'

export async function list(shopId, db = pool) {
  requireShopId(shopId)
  const { rows } = await db.query(`SELECT ${columns} FROM labels WHERE shop_id = $1 ORDER BY name`, [shopId])
  return rows
}

export async function findById(shopId, id, db = pool) {
  requireShopId(shopId)
  const { rows } = await db.query(`SELECT ${columns} FROM labels WHERE shop_id = $1 AND id = $2`, [shopId, id])
  return rows[0] ?? null
}

export async function create(shopId, { name, color = null }, db = pool) {
  requireShopId(shopId)
  const { rows } = await db.query(
    `INSERT INTO labels (shop_id, name, color) VALUES ($1, $2, $3) RETURNING ${columns}`,
    [shopId, name, color],
  )
  return rows[0]
}

export async function update(shopId, id, patch, db = pool) {
  requireShopId(shopId)
  const allowed = ['name', 'color']
  const entries = Object.entries(patch).filter(([key, value]) => allowed.includes(key) && value !== undefined)
  if (!entries.length) return findById(shopId, id, db)
  const sets = entries.map(([key], i) => `${key} = $${i + 3}`)
  const { rows } = await db.query(
    `UPDATE labels SET ${sets.join(', ')} WHERE shop_id = $1 AND id = $2 RETURNING ${columns}`,
    [shopId, id, ...entries.map(([, value]) => value)],
  )
  return rows[0] ?? null
}

export async function remove(shopId, id, db = pool) {
  requireShopId(shopId)
  const result = await db.query('DELETE FROM labels WHERE shop_id = $1 AND id = $2', [shopId, id])
  return result.rowCount > 0
}
