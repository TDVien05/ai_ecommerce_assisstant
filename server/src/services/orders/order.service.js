import { appError } from '../../errors/index.js'
import * as orderRepo from '../../repositories/orders/order.repository.js'
import * as orderItemRepo from '../../repositories/orders/orderItem.repository.js'
import * as paymentRepo from '../../repositories/payments/paymentTransaction.repository.js'
import * as shopRepo from '../../repositories/shop/shop.repository.js'
import { withTransaction } from '../../repositories/database.js'
import {
  generatePaymentCode,
  paymentDeadline,
  vietQrUrl,
  PAYMENT_WINDOW_MINUTES,
} from '../../lib/payment.js'
import { logger } from '../../lib/logger.js'
const missing = () => appError('ORDER_NOT_FOUND', 'Không tìm thấy đơn hàng.')
const conflict = () => appError('ORDER_CONFLICT', 'Trạng thái đơn đã thay đổi hoặc không thể chuyển.')
const transitions = { SHIPPING: 'PAID', COMPLETED: 'SHIPPING', CANCELLED: 'AWAITING_PAYMENT' }
const money = (value) => { const amount = Number(value); if (!Number.isSafeInteger(amount)) throw new Error('Unsafe integer in order data'); return amount }
const view = (row) => ({ id: row.id, paymentCode: row.payment_code, status: row.status, subtotal: money(row.subtotal), shippingFee: money(row.shipping_fee), total: money(row.total), customerName: row.customer_name ?? 'Khách hàng', expiresAt: row.expires_at ?? null, paidAt: row.paid_at, createdAt: row.created_at })
export async function listOrders(shopId, { status, from, to } = {}) { if (from && to && Date.parse(from) >= Date.parse(to)) throw appError('BAD_REQUEST', 'Khoảng thời gian không hợp lệ.'); return (await orderRepo.listOrders(shopId,status,undefined,{from,to})).map(view) }
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

/**
 * Payment instructions for an order: the QR the customer scans and the code the webhook matches.
 * Returns null when the shop has not configured a receiving account yet, so the caller can tell
 * the customer to wait instead of showing a broken image.
 */
export async function getPaymentInstructions(shopId, rowOrId) {
  const row = typeof rowOrId === 'string'
    ? await orderRepo.findViewById(shopId, rowOrId)
    : rowOrId
  if (!row) throw missing()

  const shop = await shopRepo.findForPayment(shopId)
  const qrUrl = vietQrUrl({
    bankCode: shop?.bank_code,
    accountNumber: shop?.bank_account_number,
    accountName: shop?.bank_account_name,
    amount: money(row.total),
    addInfo: row.payment_code,
  })

  return {
    paymentCode: row.payment_code,
    amount: money(row.total),
    expiresAt: row.expires_at ?? null,
    windowMinutes: PAYMENT_WINDOW_MINUTES,
    bankCode: shop?.bank_code ?? null,
    bankAccountNumber: shop?.bank_account_number ?? null,
    bankAccountName: shop?.bank_account_name ?? null,
    qrUrl,
    // What the customer types if they cannot scan the QR.
    transferNote: row.payment_code,
    ready: Boolean(qrUrl),
  }
}

/** Create an order with a fresh payment code and a 30-minute deadline. */
export async function createOrder(shopId, input, items) {
  return withTransaction(async (client) => {
    // Retry on the (very unlikely) code collision instead of failing the request.
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const paymentCode = generatePaymentCode()
      try {
        return await orderRepo.create(
          shopId,
          { ...input, paymentCode, expiresAt: paymentDeadline() },
          items,
        )
      } catch (error) {
        if (error?.code === '23505' && error?.constraint === 'orders_payment_code_key') continue
        throw error
      }
    }
    throw appError('CONFLICT', 'Không tạo được mã thanh toán, vui lòng thử lại.')
  })
}

/** Payment code collision retries are logged so a broken generator is noticed. */
export function logCodeRetry(shopId) {
  logger.warn({ shopId }, 'payment code collision, retrying')
}
