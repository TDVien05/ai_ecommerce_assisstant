import { appError } from '../../errors/index.js'
import * as orderRepo from '../../repositories/orders/order.repository.js'
import * as orderItemRepo from '../../repositories/orders/orderItem.repository.js'
import * as paymentRepo from '../../repositories/payments/paymentTransaction.repository.js'
import { withTransaction } from '../../repositories/database.js'
const missing = () => appError('ORDER_NOT_FOUND', 'Không tìm thấy đơn hàng.')
const conflict = () => appError('ORDER_CONFLICT', 'Trạng thái đơn đã thay đổi hoặc không thể chuyển.')
const transitions = { SHIPPING: 'PAID', COMPLETED: 'SHIPPING', CANCELLED: 'AWAITING_PAYMENT' }
const money = (value) => { const amount = Number(value); if (!Number.isSafeInteger(amount)) throw new Error('Unsafe integer in order data'); return amount }
const view = (row) => ({ id: row.id, paymentCode: row.payment_code, status: row.status, subtotal: money(row.subtotal), shippingFee: money(row.shipping_fee), total: money(row.total), customerName: row.customer_name ?? 'Khách hàng', expiresAt: row.expires_at ?? null, paidAt: row.paid_at, createdAt: row.created_at })
export async function listOrders(shopId, { status, from, to, overdue, code } = {}) {
  if (from && to && Date.parse(from) >= Date.parse(to)) throw appError('BAD_REQUEST', 'Khoảng thời gian không hợp lệ.')
  return (await orderRepo.listOrders(shopId, status, undefined, { from, to, overdue: overdue === '1', code })).map(view)
}
export async function getOrder(shopId, paymentCode, { client, lock = false } = {}) { const row = await orderRepo.findOrder(shopId,paymentCode,client,lock); if (!row) throw missing(); return view(row) }
export async function changeStatus(shopId, paymentCode, status, expected, client) {
  const current = await getOrder(shopId,paymentCode,{client,lock:true})
  if (!transitions[status] || current.status !== transitions[status] || current.id !== expected.id || current.status !== expected.status) throw conflict()
  const row = await orderRepo.setStatusFrom(shopId,current.id,current.status,status,client)
  if (!row) throw conflict()
  return { before: { id: current.id, paymentCode, status: current.status }, after: { id: current.id, paymentCode, status } }
}
export async function restoreStatus(shopId, before, after, client) {
  const current = await getOrder(shopId,after.paymentCode,{client,lock:true})
  if (current.id !== after.id || current.status !== after.status) throw conflict()
  if (!await orderRepo.setStatusFrom(shopId,current.id,after.status,before.status,client)) throw conflict()
}

export async function getOrderDetail(shopId, id) {
  const row = await orderRepo.findViewById(shopId,id)
  if (!row) throw missing()
  const [items,payments] = await Promise.all([orderItemRepo.findItems(shopId,id),paymentRepo.findPayments(shopId,id)])
  return { ...view(row), shippingPhone: row.shipping_phone, shippingAddress: row.shipping_address,
    items: items.map((item) => ({ name:item.name_snapshot, variant:item.variant, unitPrice:money(item.unit_price), quantity:item.quantity, lineTotal:money(money(item.unit_price)*item.quantity) })),
    payments: payments.map((p) => ({ id:p.id, gateway:p.gateway ?? '', accountNumber:p.account_number ?? '', code:p.code, content:p.content ?? '', referenceCode:p.reference_code ?? '', transferType:p.transfer_type, transferAmount:money(p.transfer_amount), transactionDate:p.transaction_date, orderId:p.order_id, orderCode:row.payment_code, shortfall:null, matchStatus:p.match_status })) }
}
export async function updateOrderStatus(shopId,id,status) {
  return withTransaction(async (client) => {
    const row = await orderRepo.findViewById(shopId,id,client,true)
    if (!row) throw missing()
    await changeStatus(shopId,row.payment_code,status,{id:row.id,status:row.status},client)
    return view(await orderRepo.findViewById(shopId,id,client))
  })
}
