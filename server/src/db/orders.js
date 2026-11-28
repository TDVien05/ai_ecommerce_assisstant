import { pool } from './pool.js'

const columns = 'id, payment_code, status, subtotal, shipping_fee, total, paid_at, created_at'
export async function listOrders(shopId, status, client = pool) {
  const { rows } = await client.query(`SELECT ${columns} FROM orders WHERE shop_id=$1 AND ($2::text IS NULL OR status=$2) ORDER BY created_at DESC,id LIMIT 100`, [shopId, status ?? null])
  return rows
}
export async function findOrder(shopId, code, client = pool, lock = false) {
  const { rows } = await client.query(`SELECT ${columns} FROM orders WHERE shop_id=$1 AND payment_code=$2${lock ? ' FOR UPDATE' : ''}`, [shopId, code])
  return rows[0] ?? null
}
export async function setStatus(shopId, id, oldStatus, status, client) {
  const { rows } = await client.query(`UPDATE orders SET status=$4 WHERE shop_id=$1 AND id=$2 AND status=$3 RETURNING ${columns}`, [shopId,id,oldStatus,status])
  return rows[0] ?? null
}
