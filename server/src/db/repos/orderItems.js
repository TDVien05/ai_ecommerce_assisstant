import { pool } from '../pool.js'
import { requireShopId } from './guard.js'

export async function listByOrder(shopId, orderId, db = pool) {
  requireShopId(shopId)
  const { rows } = await db.query(
    `SELECT i.* FROM order_items i JOIN orders o ON o.id = i.order_id
      WHERE o.shop_id = $1 AND i.order_id = $2
      ORDER BY i.name_snapshot`,
    [shopId, orderId],
  )
  return rows
}

export async function create(shopId, orderId, item, db = pool) {
  requireShopId(shopId)
  const { productId = null, nameSnapshot, variant = {}, unitPrice, unitCost = 0, quantity } = item
  const { rows } = await db.query(
    `INSERT INTO order_items (order_id, product_id, name_snapshot, variant, unit_price, unit_cost, quantity)
     SELECT o.id, $3, $4, $5, $6, $7, $8 FROM orders o WHERE o.shop_id = $1 AND o.id = $2
     RETURNING *`,
    [shopId, orderId, productId, nameSnapshot, variant, unitPrice, unitCost, quantity],
  )
  return rows[0] ?? null
}
