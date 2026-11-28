import { pool } from '../pool.js'

const columns = `o.id,o.payment_code,o.status,o.subtotal,o.shipping_fee,o.total,o.paid_at,o.created_at,o.expires_at,o.shipping_phone,o.shipping_address,COALESCE(c.name,o.shipping_name,'Khách hàng') AS customer_name`
const base = `FROM orders o LEFT JOIN customers c ON c.id=o.customer_id AND c.shop_id=o.shop_id`
export async function listOrders(shopId, status, client = pool, { from = null, to = null } = {}) {
  const { rows } = await client.query(`SELECT ${columns} ${base} WHERE o.shop_id=$1 AND ($2::text IS NULL OR o.status=$2) AND ($3::timestamptz IS NULL OR o.created_at >= $3) AND ($4::timestamptz IS NULL OR o.created_at < $4) ORDER BY o.created_at DESC,o.id LIMIT 100`, [shopId,status ?? null,from,to])
  return rows
}
export async function findOrder(shopId, code, client = pool, lock = false) {
  const { rows } = await client.query(`SELECT ${columns} ${base} WHERE o.shop_id=$1 AND o.payment_code=$2${lock ? ' FOR UPDATE OF o' : ''}`, [shopId,code])
  return rows[0] ?? null
}
export async function findById(shopId, id, client = pool, lock = false) {
  const { rows } = await client.query(`SELECT ${columns} ${base} WHERE o.shop_id=$1 AND o.id=$2${lock ? ' FOR UPDATE OF o' : ''}`, [shopId,id])
  return rows[0] ?? null
}
export async function findItems(shopId, id, client = pool) {
  const { rows } = await client.query(`SELECT i.name_snapshot,i.variant,i.unit_price,i.quantity FROM order_items i JOIN orders o ON o.id=i.order_id WHERE o.shop_id=$1 AND o.id=$2 ORDER BY i.id`, [shopId,id])
  return rows
}
export async function findPayments(shopId,id,client = pool) {
  const { rows } = await client.query(`SELECT p.id,p.gateway,p.account_number,p.code,p.content,p.reference_code,p.transfer_type,p.transfer_amount,p.transaction_date,p.order_id,p.match_status FROM payment_transactions p JOIN orders o ON o.id=p.order_id WHERE o.shop_id=$1 AND o.id=$2 ORDER BY p.created_at DESC`, [shopId,id])
  return rows
}
export async function setStatus(shopId, id, oldStatus, status, client) {
  const { rows } = await client.query(`UPDATE orders SET status=$4 WHERE shop_id=$1 AND id=$2 AND status=$3 RETURNING id,payment_code,status,subtotal,shipping_fee,total,paid_at,created_at`, [shopId,id,oldStatus,status])
  return rows[0] ?? null
}
