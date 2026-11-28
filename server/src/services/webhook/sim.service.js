import { ingest } from './webhook.service.js'
import * as ordersRepo from '../../repositories/orders/order.repository.js'
import * as shopsRepo from '../../repositories/shop/shop.repository.js'
import { notFound, badRequest } from '../../errors/index.js'

/**
 * "Simulate payment" button. Builds exactly the payload SePay would send for this order and
 * pushes it through the same pipe (provider = sim, so it is traceable in webhook_events).
 */
export async function simulatePayment(shopId, orderId) {
  const order = await ordersRepo.findById(shopId, orderId)
  if (!order) throw notFound('Không tìm thấy đơn hàng trong shop này.')
  if (!order.payment_code) throw badRequest('Đơn hàng không có mã thanh toán.')

  const shop = await shopsRepo.findById(shopId)
  const sepayId = Date.now()

  const payload = {
    id: sepayId,
    gateway: shop.bank_code ?? 'MB',
    transactionDate: new Date().toISOString(),
    accountNumber: shop.bank_account_number ?? '',
    code: order.payment_code,
    content: `${order.payment_code} chuyen tien (mo phong)`,
    transferType: 'in',
    transferAmount: order.total,
    accumulated: order.total,
    subAccount: null,
    referenceCode: `SIM${sepayId}`,
    description: 'Giao dịch mô phỏng từ dashboard',
  }

  const result = await ingest({ provider: 'sim', externalId: String(sepayId), type: 'payment.received', payload })
  return { orderId, paymentCode: order.payment_code, amount: order.total, ...result }
}
