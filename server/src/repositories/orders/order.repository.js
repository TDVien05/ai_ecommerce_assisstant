// All queries for the `orders` table. See docs/ARCHITECTURE.md, section "Repositories".
import { query, withTransaction } from '../../config/database.js'
import { requireShopId } from '../guard.js'

const columns = `id, shop_id, customer_id, payment_code, status, risk_level, subtotal, shipping_fee, total,
  shipping_name, shipping_phone, shipping_address, expires_at, paid_at, created_at`

export const STATUSES = [
  'AWAITING_PAYMENT', 'PAID', 'EXPIRED', 'CANCELLED', 'SHIPPING', 'COMPLETED',
  'SHIPPED', 'LIKELY_DELIVERED', 'DELIVERED', 'FOLLOWED_UP', 'REFUNDED',
]

export async function list(shopId, { status, from, to, limit = 100, offset = 0 } = {}, db) {
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
  const { rows } = await query(
    `SELECT ${columns} FROM orders WHERE ${where} ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params, db,
  )
  return rows
}

export async function findById(shopId, id, db) {
  requireShopId(shopId)
  const { rows } = await query(
    `SELECT ${columns} FROM orders WHERE shop_id = $1 AND id = $2`,
    [shopId, id], db,
  )
  const order = rows[0]
  if (!order) return null
  const items = await query('SELECT * FROM order_items WHERE order_id = $1 ORDER BY name_snapshot', [id], db)
  return { ...order, items: items.rows }
}

/** Payment codes are globally unique; the shop id keeps the lookup tenant-scoped. */
export async function findByPaymentCode(shopId, paymentCode, db) {
  requireShopId(shopId)
  const { rows } = await query(
    `SELECT ${columns} FROM orders WHERE shop_id = $1 AND payment_code = $2`,
    [shopId, paymentCode], db,
  )
  return rows[0] ?? null
}

/**
 * Cross-shop lookup for webhook intake only: SePay gives us a code but not the shop.
 * Returns the shop that owns the order, or null.
 */
export async function findShopByPaymentCode(paymentCode, db) {
  if (!paymentCode) return null
  const { rows } = await query(
    'SELECT shop_id, id, status, total FROM orders WHERE payment_code = $1',
    [paymentCode], db,
  )
  return rows[0] ?? null
}

/** Create the order and its items in one transaction. */
export async function create(shopId, order, items) {
  requireShopId(shopId)
  return withTransaction(async (client) => {
    const { rows } = await query(
      `INSERT INTO orders (shop_id, customer_id, payment_code, status, risk_level, subtotal,
                           shipping_fee, total, shipping_name, shipping_phone, shipping_address, expires_at)
       VALUES ($1, $2, $3, COALESCE($4, 'AWAITING_PAYMENT'), COALESCE($5, 'LOW'), $6, $7, $8, $9, $10, $11, $12)
       RETURNING ${columns}`,
      [shopId, order.customerId, order.paymentCode, order.status ?? null, order.riskLevel ?? null,
        order.subtotal, order.shippingFee ?? 0, order.total, order.shippingName ?? null,
        order.shippingPhone ?? null, order.shippingAddress ?? null, order.expiresAt ?? null], client,
    )
    const created = rows[0]
    const stored = []
    for (const item of items) {
      const result = await query(
        `INSERT INTO order_items (order_id, product_id, name_snapshot, variant, unit_price, unit_cost, quantity)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [created.id, item.productId ?? null, item.nameSnapshot, item.variant ?? {}, item.unitPrice,
          item.unitCost ?? 0, item.quantity], client,
      )
      stored.push(result.rows[0])
    }
    return { ...created, items: stored }
  })
}

export async function setStatus(shopId, id, status, { paidAt } = {}, db) {
  requireShopId(shopId)
  const { rows } = await query(
    `UPDATE orders SET status = $3,
            paid_at = COALESCE($4, paid_at)
      WHERE shop_id = $1 AND id = $2
      RETURNING ${columns}`,
    [shopId, id, status, paidAt ?? null], db,
  )
  return rows[0] ?? null
}

/** AWAITING_PAYMENT orders whose deadline has passed. */
export async function findExpired(shopId, now = new Date(), db) {
  requireShopId(shopId)
  const { rows } = await query(
    `SELECT ${columns} FROM orders
      WHERE shop_id = $1 AND status = 'AWAITING_PAYMENT' AND expires_at IS NOT NULL AND expires_at < $2`,
    [shopId, now], db,
  )
  return rows
}

const viewColumns = `o.id,o.payment_code,o.status,o.subtotal,o.shipping_fee,o.total,o.paid_at,o.created_at,o.expires_at,o.shipping_phone,o.shipping_address,COALESCE(c.name,o.shipping_name,'Khách hàng') AS customer_name`

const viewFrom = `FROM orders o LEFT JOIN customers c ON c.id=o.customer_id AND c.shop_id=o.shop_id`

export async function listOrders(shopId, status, client, { from = null, to = null, overdue = false, code = null } = {}) {
  const { rows } = await query(`SELECT ${viewColumns} ${viewFrom}
    WHERE o.shop_id = $1 AND ($2::text IS NULL OR o.status = $2)
      AND ($3::timestamptz IS NULL OR o.created_at >= $3) AND ($4::timestamptz IS NULL OR o.created_at < $4)
      AND (NOT $5::boolean OR (o.status = 'AWAITING_PAYMENT' AND o.expires_at <= now()))
      AND ($6::text IS NULL OR o.payment_code = $6)
    ORDER BY o.created_at DESC, o.id LIMIT 100`, [shopId, status ?? null, from, to, overdue, code], client)
  return rows
}

export async function findOrder(shopId, code, client, lock = false) {
  const { rows } = await query(`SELECT ${viewColumns} ${viewFrom} WHERE o.shop_id=$1 AND o.payment_code=$2${lock ? ' FOR UPDATE OF o' : ''}`, [shopId,code], client)
  return rows[0] ?? null
}

export async function findViewById(shopId, id, client, lock = false) {
  const { rows } = await query(`SELECT ${viewColumns} ${viewFrom} WHERE o.shop_id=$1 AND o.id=$2${lock ? ' FOR UPDATE OF o' : ''}`, [shopId,id], client)
  return rows[0] ?? null
}

export async function setStatusFrom(shopId, id, oldStatus, status, client) {
  const { rows } = await query(`UPDATE orders SET status=$4 WHERE shop_id=$1 AND id=$2 AND status=$3 RETURNING id,payment_code,status,subtotal,shipping_fee,total,paid_at,created_at`, [shopId,id,oldStatus,status], client)
  return rows[0] ?? null
}

export async function exists(shopId,id,client) { const {rowCount}=await query('SELECT 1 FROM orders WHERE shop_id=$1 AND id=$2',[shopId,id], client);return rowCount>0 }

/** Demo copy: how far to shift template dates so its newest order lands "now" (Postgres interval text). */
export async function demoShift(templateId, db) {
  const { rows } = await query(
    `SELECT (now() - COALESCE(max(created_at), now()))::text AS shift
       FROM orders WHERE shop_id = $1`,
    [templateId], db,
  )
  return rows[0].shift
}

/** Demo copy: temp table demo_order_map (old_id -> new_id) for the child tables; dropped on commit. */
export async function createDemoOrderMap(templateId, db) {
  await query(`
    CREATE TEMP TABLE demo_order_map ON COMMIT DROP AS
    SELECT o.id AS old_id, gen_random_uuid() AS new_id
      FROM orders o WHERE o.shop_id = $1`, [templateId], db)
}

/** Demo copy: orders, using demo_order_map ids and the copied customers. Run after customers. */
export async function copyFromShop(shopId, templateId, interval, codeSuffix, db) {
  await query(
    `INSERT INTO orders (id, shop_id, customer_id, payment_code, status, risk_level, subtotal, shipping_fee,
                         total, shipping_name, shipping_phone, shipping_address, expires_at, paid_at, created_at)
     SELECT m.new_id, $1, nc.id, o.payment_code || '-' || $4, o.status, o.risk_level,
            o.subtotal, o.shipping_fee, o.total, o.shipping_name, o.shipping_phone, o.shipping_address,
            o.expires_at + $3::interval, o.paid_at + $3::interval, o.created_at + $3::interval
       FROM orders o
       JOIN demo_order_map m ON m.old_id = o.id
       JOIN customers tc ON tc.id = o.customer_id
       JOIN customers nc ON nc.shop_id = $1 AND nc.psid = tc.psid
      WHERE o.shop_id = $2`,
    [shopId, templateId, interval, codeSuffix], db,
  )
}

/** Activity in a period: count and total of orders per status. */
export async function activityByStatus(shopId, from, to, db) {
  const { rows } = await query(`SELECT status,count(*)::int AS count,coalesce(sum(total),0)::text AS amount
    FROM orders WHERE shop_id=$1 AND created_at >= $2 AND created_at < $3 GROUP BY status ORDER BY status`, [shopId, from, to], db)
  return rows
}
