// All queries for the `order_items` table. See docs/ARCHITECTURE.md, section "Repositories".
import { query } from '../../config/database.js'
import { requireShopId } from '../guard.js'

export async function listByOrder(shopId, orderId, db) {
  requireShopId(shopId)
  const { rows } = await query(
    `SELECT i.* FROM order_items i JOIN orders o ON o.id = i.order_id
      WHERE o.shop_id = $1 AND i.order_id = $2
      ORDER BY i.name_snapshot`,
    [shopId, orderId], db,
  )
  return rows
}

export async function create(shopId, orderId, item, db) {
  requireShopId(shopId)
  const { productId = null, nameSnapshot, variant = {}, unitPrice, unitCost = 0, quantity } = item
  const { rows } = await query(
    `INSERT INTO order_items (order_id, product_id, name_snapshot, variant, unit_price, unit_cost, quantity)
     SELECT o.id, $3, $4, $5, $6, $7, $8 FROM orders o WHERE o.shop_id = $1 AND o.id = $2
     RETURNING *`,
    [shopId, orderId, productId, nameSnapshot, variant, unitPrice, unitCost, quantity], db,
  )
  return rows[0] ?? null
}

export async function findItems(shopId, id, client) {
  const { rows } = await query(`SELECT i.name_snapshot,i.variant,i.unit_price,i.quantity FROM order_items i JOIN orders o ON o.id=i.order_id WHERE o.shop_id=$1 AND o.id=$2 ORDER BY i.id`, [shopId,id], client)
  return rows
}

/** Demo copy: order lines of the copied orders (demo_order_map), linked to the copied products by sku. */
export async function copyFromShop(shopId, db) {
  await query(
    `INSERT INTO order_items (order_id, product_id, name_snapshot, variant, unit_price, unit_cost, quantity)
     SELECT m.new_id, np.id, oi.name_snapshot, oi.variant, oi.unit_price, oi.unit_cost, oi.quantity
       FROM order_items oi
       JOIN demo_order_map m ON m.old_id = oi.order_id
       LEFT JOIN products tp ON tp.id = oi.product_id
       LEFT JOIN products np ON np.shop_id = $1 AND np.sku = tp.sku`,
    [shopId], db,
  )
}
