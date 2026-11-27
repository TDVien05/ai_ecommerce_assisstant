import { pool } from '../pool.js'
import { requireShopId } from './guard.js'

const columns = 'id, shop_id, title, detail, status, due_at, order_id, created_at'

export async function list(shopId, { status = 'OPEN', limit = 100, offset = 0 } = {}, db = pool) {
  requireShopId(shopId)
  const params = [shopId]
  let where = 'shop_id = $1'
  if (status) {
    params.push(status)
    where += ` AND status = $${params.length}`
  }
  params.push(limit, offset)
  const { rows } = await db.query(
    `SELECT ${columns} FROM todos WHERE ${where}
      ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  )
  return rows
}

export async function findById(shopId, id, db = pool) {
  requireShopId(shopId)
  const { rows } = await db.query(`SELECT ${columns} FROM todos WHERE shop_id = $1 AND id = $2`, [shopId, id])
  return rows[0] ?? null
}

export async function create(shopId, { title, detail = null, dueAt = null, orderId = null }, db = pool) {
  requireShopId(shopId)
  const { rows } = await db.query(
    `INSERT INTO todos (shop_id, title, detail, due_at, order_id) VALUES ($1, $2, $3, $4, $5)
     RETURNING ${columns}`,
    [shopId, title, detail, dueAt, orderId],
  )
  return rows[0]
}

export async function setStatus(shopId, id, status, db = pool) {
  requireShopId(shopId)
  const { rows } = await db.query(
    `UPDATE todos SET status = $3 WHERE shop_id = $1 AND id = $2 RETURNING ${columns}`,
    [shopId, id, status],
  )
  return rows[0] ?? null
}
