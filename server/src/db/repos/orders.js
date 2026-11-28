import { pool, withTransaction } from '../pool.js'
import { requireShopId } from './guard.js'

const columns = `id, shop_id, customer_id, payment_code, status, risk_level, subtotal, shipping_fee, total,
  shipping_name, shipping_phone, shipping_address, expires_at, paid_at, created_at`

export const STATUSES = [
  'AWAITING_PAYMENT', 'PAID', 'EXPIRED', 'CANCELLED', 'SHIPPING', 'COMPLETED',
  'SHIPPED', 'LIKELY_DELIVERED', 'DELIVERED', 'FOLLOWED_UP', 'REFUNDED',
]

export async function list(shopId, { status, from, to, limit = 100, offset = 0 } = {}, db = pool) {
  requireShopId(shopId)
  const params = [shopId]
  let where = 'shop_id = $1'
  if (status) {
    params.push(status)
    where += ` AND status = $${params.length}`
  }
  if (from) {
    params.push(from)
    where += ` AND created_at >= $${params.length}`
  }
  if (to) {
    params.push(to)
    where += ` AND created_at < $${params.length}`
  }
  params.push(limit, offset)
  const { rows } = await db.query(
    `SELECT ${columns} FROM orders WHERE ${where} ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  )
  return rows
}

export async function findById(shopId, id, db = pool) {
  requireShopId(shopId)
  const { rows } = await db.query(
    `SELECT ${columns} FROM orders WHERE shop_id = $1 AND id = $2`,
    [shopId, id],
  )
  const order = rows[0]
  if (!order) return null
  const items = await db.query('SELECT * FROM order_items WHERE order_id = $1 ORDER BY name_snapshot', [id])
  return { ...order, items: items.rows }
}

/** Payment codes are globally unique; the shop id keeps the lookup tenant-scoped. */
export async function findByPaymentCode(shopId, paymentCode, db = pool) {
  requireShopId(shopId)
  const { rows } = await db.query(
    `SELECT ${columns} FROM orders WHERE shop_id = $1 AND payment_code = $2`,
    [shopId, paymentCode],
  )
  return rows[0] ?? null
}

/**
 * Cross-shop lookup for webhook intake only: SePay gives us a code but not the shop.
 * Returns the shop that owns the order, or null.
 */
export async function findShopByPaymentCode(paymentCode, db = pool) {
  if (!paymentCode) return null
  const { rows } = await db.query(
    'SELECT shop_id, id, status, total FROM orders WHERE payment_code = $1',
    [paymentCode],
  )
  return rows[0] ?? null
}

/** Create the order and its items in one transaction. */
export async function create(shopId, order, items) {
  requireShopId(shopId)
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO orders (shop_id, customer_id, payment_code, status, risk_level, subtotal,
                           shipping_fee, total, shipping_name, shipping_phone, shipping_address, expires_at)
       VALUES ($1, $2, $3, COALESCE($4, 'AWAITING_PAYMENT'), COALESCE($5, 'LOW'), $6, $7, $8, $9, $10, $11, $12)
       RETURNING ${columns}`,
      [shopId, order.customerId, order.paymentCode, order.status ?? null, order.riskLevel ?? null,
        order.subtotal, order.shippingFee ?? 0, order.total, order.shippingName ?? null,
        order.shippingPhone ?? null, order.shippingAddress ?? null, order.expiresAt ?? null],
    )
    const created = rows[0]
    const stored = []
    for (const item of items) {
      const result = await client.query(
        `INSERT INTO order_items (order_id, product_id, name_snapshot, variant, unit_price, unit_cost, quantity)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [created.id, item.productId ?? null, item.nameSnapshot, item.variant ?? {}, item.unitPrice,
          item.unitCost ?? 0, item.quantity],
      )
      stored.push(result.rows[0])
    }
    return { ...created, items: stored }
  })
}

export async function setStatus(shopId, id, status, { paidAt } = {}, db = pool) {
  requireShopId(shopId)
  const { rows } = await db.query(
    `UPDATE orders SET status = $3,
            paid_at = COALESCE($4, paid_at)
      WHERE shop_id = $1 AND id = $2
      RETURNING ${columns}`,
    [shopId, id, status, paidAt ?? null],
  )
  return rows[0] ?? null
}

/** AWAITING_PAYMENT orders whose deadline has passed. */
export async function findExpired(shopId, now = new Date(), db = pool) {
  requireShopId(shopId)
  const { rows } = await db.query(
    `SELECT ${columns} FROM orders
      WHERE shop_id = $1 AND status = 'AWAITING_PAYMENT' AND expires_at IS NOT NULL AND expires_at < $2`,
    [shopId, now],
  )
  return rows
}
