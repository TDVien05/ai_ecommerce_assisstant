// All queries for the `todos` table. See docs/ARCHITECTURE.md, section "Repositories".
import { query } from '../../config/database.js'
import { requireShopId } from '../guard.js'

const columns = 'id, shop_id, title, detail, status, due_at, order_id, created_at'

export async function list(shopId, { status = 'OPEN', limit = 100, offset = 0 } = {}, db) {
  requireShopId(shopId)
  const params = [shopId]
  let where = 'shop_id = $1'
  if (status) {
    params.push(status)
    where += ` AND status = $${params.length}`
  }
  params.push(limit, offset)
  const { rows } = await query(
    `SELECT ${columns} FROM todos WHERE ${where}
      ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params, db,
  )
  return rows
}

export async function findById(shopId, id, db) {
  requireShopId(shopId)
  const { rows } = await query(`SELECT ${columns} FROM todos WHERE shop_id = $1 AND id = $2`, [shopId, id], db)
  return rows[0] ?? null
}

export async function create(shopId, { title, detail = null, dueAt = null, orderId = null }, db) {
  requireShopId(shopId)
  const { rows } = await query(
    `INSERT INTO todos (shop_id, title, detail, due_at, order_id) VALUES ($1, $2, $3, $4, $5)
     RETURNING ${columns}`,
    [shopId, title, detail, dueAt, orderId], db,
  )
  return rows[0]
}

export async function setStatus(shopId, id, status, db) {
  requireShopId(shopId)
  const { rows } = await query(
    `UPDATE todos SET status = $3 WHERE shop_id = $1 AND id = $2 RETURNING ${columns}`,
    [shopId, id, status], db,
  )
  return rows[0] ?? null
}

/** Demo copy: todos, due dates shifted by `interval`. */
export async function copyFromShop(shopId, templateId, interval, db) {
  await query(
    `INSERT INTO todos (shop_id, title, detail, status, due_at)
     SELECT $1, title, detail, status, due_at + $3::interval FROM todos WHERE shop_id = $2`,
    [shopId, templateId, interval], db,
  )
}

/** Demo reset: delete every row of this shop, in the caller's transaction. */
export async function removeAllForShop(shopId, db) {
  requireShopId(shopId)
  await query('DELETE FROM todos WHERE shop_id = $1', [shopId], db)
}
