import { pool } from '../pool.js'
import { requireShopId } from './guard.js'

const columns = 'id, shop_id, customer_id, ai_paused, created_at'

export async function list(shopId, { limit = 50, offset = 0 } = {}, db = pool) {
  requireShopId(shopId)
  const { rows } = await db.query(
    `SELECT ${columns} FROM conversations WHERE shop_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
    [shopId, limit, offset],
  )
  return rows
}

export async function findById(shopId, id, db = pool) {
  requireShopId(shopId)
  const { rows } = await db.query(`SELECT ${columns} FROM conversations WHERE shop_id = $1 AND id = $2`, [shopId, id])
  return rows[0] ?? null
}

export async function findByCustomer(shopId, customerId, db = pool) {
  requireShopId(shopId)
  const { rows } = await db.query(
    `SELECT ${columns} FROM conversations WHERE shop_id = $1 AND customer_id = $2`,
    [shopId, customerId],
  )
  return rows[0] ?? null
}

/** One conversation per customer; returns the existing row when it already exists. */
export async function ensureForCustomer(shopId, customerId, db = pool) {
  requireShopId(shopId)
  const { rows } = await db.query(
    `INSERT INTO conversations (shop_id, customer_id) VALUES ($1, $2)
     ON CONFLICT (customer_id) DO UPDATE SET customer_id = EXCLUDED.customer_id
     RETURNING ${columns}`,
    [shopId, customerId],
  )
  return rows[0]
}

export async function setAiPaused(shopId, id, aiPaused, db = pool) {
  requireShopId(shopId)
  const { rows } = await db.query(
    `UPDATE conversations SET ai_paused = $3 WHERE shop_id = $1 AND id = $2 RETURNING ${columns}`,
    [shopId, id, aiPaused],
  )
  return rows[0] ?? null
}
