import { pool } from '../pool.js'
import { requireShopId } from './guard.js'

const columns = `id, shop_id, sku, name, description, price, cost, stock, variants, image_url, is_active, created_at`

export async function list(shopId, { q, limit = 50, offset = 0, activeOnly = true } = {}, db = pool) {
  requireShopId(shopId)
  const params = [shopId]
  let where = 'shop_id = $1'
  if (activeOnly) where += ' AND is_active'
  if (q) {
    params.push(`%${q}%`)
    where += ` AND (name ILIKE $${params.length} OR sku ILIKE $${params.length})`
  }
  params.push(limit, offset)
  const { rows } = await db.query(
    `SELECT ${columns} FROM products WHERE ${where} ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  )
  return rows
}

export async function findById(shopId, id, db = pool) {
  requireShopId(shopId)
  const { rows } = await db.query(`SELECT ${columns} FROM products WHERE shop_id = $1 AND id = $2`, [shopId, id])
  return rows[0] ?? null
}

export async function create(shopId, product, db = pool) {
  requireShopId(shopId)
  const { sku = null, name, description = null, price, cost = 0, stock = 0, variants = {}, image_url = null } = product
  const { rows } = await db.query(
    `INSERT INTO products (shop_id, sku, name, description, price, cost, stock, variants, image_url)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING ${columns}`,
    [shopId, sku, name, description, price, cost, stock, variants, image_url],
  )
  return rows[0]
}

export async function update(shopId, id, patch, db = pool) {
  requireShopId(shopId)
  const allowed = ['sku', 'name', 'description', 'price', 'cost', 'stock', 'variants', 'image_url', 'is_active']
  const entries = Object.entries(patch).filter(([key, value]) => allowed.includes(key) && value !== undefined)
  if (!entries.length) return findById(shopId, id, db)
  const sets = entries.map(([key], i) => `${key} = $${i + 3}`)
  const { rows } = await db.query(
    `UPDATE products SET ${sets.join(', ')} WHERE shop_id = $1 AND id = $2 RETURNING ${columns}`,
    [shopId, id, ...entries.map(([, value]) => value)],
  )
  return rows[0] ?? null
}

export async function deactivate(shopId, id, db = pool) {
  return update(shopId, id, { is_active: false }, db)
}

/** Positive delta restocks, negative delta sells. Never goes below zero. */
export async function adjustStock(shopId, id, delta, db = pool) {
  requireShopId(shopId)
  const { rows } = await db.query(
    `UPDATE products SET stock = stock + $3 WHERE shop_id = $1 AND id = $2 AND stock + $3 >= 0
     RETURNING ${columns}`,
    [shopId, id, delta],
  )
  return rows[0] ?? null
}
