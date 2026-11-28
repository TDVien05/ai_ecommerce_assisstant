import { HttpError } from '../lib/httpError.js'
import * as db from '../db/orders.js'
const missing = () => new HttpError(404, 'ORDER_NOT_FOUND', 'Không tìm thấy đơn hàng.')
const conflict = () => new HttpError(409, 'ORDER_CONFLICT', 'Trạng thái đơn đã thay đổi hoặc không thể chuyển.')
const transitions = { SHIPPING: 'PAID', COMPLETED: 'SHIPPING', CANCELLED: 'AWAITING_PAYMENT' }
const money = (value) => { const amount = Number(value); if (!Number.isSafeInteger(amount)) throw new Error('Unsafe integer in order data'); return amount }
const view = (row) => ({ id: row.id, paymentCode: row.payment_code, status: row.status, subtotal: money(row.subtotal), shippingFee: money(row.shipping_fee), total: money(row.total), paidAt: row.paid_at, createdAt: row.created_at })
export async function listOrders(shopId, { status } = {}) { return (await db.listOrders(shopId,status)).map(view) }
export async function getOrder(shopId, paymentCode, { client, lock = false } = {}) { const row = await db.findOrder(shopId,paymentCode,client,lock); if (!row) throw missing(); return view(row) }
export async function changeStatus(shopId, paymentCode, status, expected, client) {
  const current = await getOrder(shopId,paymentCode,{client,lock:true})
  if (!transitions[status] || current.status !== transitions[status] || current.id !== expected.id || current.status !== expected.status) throw conflict()
  const row = await db.setStatus(shopId,current.id,current.status,status,client)
  if (!row) throw conflict()
  return { before: { id: current.id, paymentCode, status: current.status }, after: { id: current.id, paymentCode, status } }
}
export async function restoreStatus(shopId, before, after, client) {
  const current = await getOrder(shopId,after.paymentCode,{client,lock:true})
  if (current.id !== after.id || current.status !== after.status) throw conflict()
  if (!await db.setStatus(shopId,current.id,after.status,before.status,client)) throw conflict()
}
