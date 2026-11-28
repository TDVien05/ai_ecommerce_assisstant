import { pool } from '../pool.js'
import { requireShopId } from './guard.js'

const columns = 'id, shop_id, psid, name, phone, address, created_at'

export async function list(shopId, { limit = 50, offset = 0 } = {}, db = pool) {
  requireShopId(shopId)
  const { rows } = await db.query(
    `SELECT ${columns} FROM customers WHERE shop_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
    [shopId, limit, offset],
  )
  return rows
}

export async function findById(shopId, id, db = pool) {
  requireShopId(shopId)
  const { rows } = await db.query(`SELECT ${columns} FROM customers WHERE shop_id = $1 AND id = $2`, [shopId, id])
  return rows[0] ?? null
}

export async function findByPsid(shopId, psid, db = pool) {
  requireShopId(shopId)
  const { rows } = await db.query(`SELECT ${columns} FROM customers WHERE shop_id = $1 AND psid = $2`, [shopId, psid])
  return rows[0] ?? null
}

export async function create(shopId, { psid, name = null, phone = null, address = null }, db = pool) {
  requireShopId(shopId)
  const { rows } = await db.query(
    `INSERT INTO customers (shop_id, psid, name, phone, address) VALUES ($1, $2, $3, $4, $5)
     RETURNING ${columns}`,
    [shopId, psid, name, phone, address],
  )
  return rows[0]
}

/** Insert or update the profile fields of a known customer (idempotent for webhook retries). */
export async function upsertByPsid(shopId, { psid, name = null, phone = null, address = null }, db = pool) {
  requireShopId(shopId)
  const { rows } = await db.query(
    `INSERT INTO customers (shop_id, psid, name, phone, address) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (shop_id, psid) DO UPDATE
       SET name = COALESCE(EXCLUDED.name, customers.name),
           phone = COALESCE(EXCLUDED.phone, customers.phone),
           address = COALESCE(EXCLUDED.address, customers.address)
     RETURNING ${columns}`,
    [shopId, psid, name, phone, address],
  )
  return rows[0]
}

export async function update(shopId, id, patch, db = pool) {
  requireShopId(shopId)
  const allowed = ['name', 'phone', 'address']
  const entries = Object.entries(patch).filter(([key, value]) => allowed.includes(key) && value !== undefined)
  if (!entries.length) return findById(shopId, id, db)
  const sets = entries.map(([key], i) => `${key} = $${i + 3}`)
  const { rows } = await db.query(
    `UPDATE customers SET ${sets.join(', ')} WHERE shop_id = $1 AND id = $2 RETURNING ${columns}`,
    [shopId, id, ...entries.map(([, value]) => value)],
  )
  return rows[0] ?? null
}
