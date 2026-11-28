import { ApiError } from '@/lib/api'
import { respond, store } from '@/lib/mockServer/store'
import type { OrderStatus, OrdersApi, OrderTransition } from './types'

export const mockOrders: OrdersApi = {
  async list(query = {}) {
    const now = Date.now()
    return respond({ items: store.orders.filter((order) => (!query.status || order.status === query.status)
      && (!query.from || order.createdAt >= query.from) && (!query.to || order.createdAt <= query.to)
      && (!query.code || order.paymentCode === query.code)
      && (!query.overdue || (order.status === 'AWAITING_PAYMENT' && order.expiresAt && Date.parse(order.expiresAt) <= now))) })
  },
  async get(id) {
    const order = store.orders.find((item) => item.id === id)
    if (!order) throw new ApiError(404, 'ORDER_NOT_FOUND', 'Không tìm thấy đơn hàng.')
    return respond({ order: { ...order, payments: store.payments.filter((payment) => payment.orderId === id) } })
  },
  async updateStatus(id, { status }) {
    const order = store.orders.find((item) => item.id === id)
    if (!order) throw new ApiError(404, 'ORDER_NOT_FOUND', 'Không tìm thấy đơn hàng.')
    if (status === 'SHIPPING' && store.heldOrders.has(id)) throw new ApiError(409, 'ORDER_HELD', 'Đơn đang được giữ để kiểm tra.')
    const allowed: Partial<Record<OrderStatus, OrderTransition>> = { AWAITING_PAYMENT: 'CANCELLED', PAID: 'SHIPPING', SHIPPING: 'COMPLETED' }
    if (allowed[order.status] !== status) throw new ApiError(409, 'INVALID_TRANSITION', 'Không thể chuyển trạng thái đơn hàng.')
    order.status = status
    return respond({ order })
  },
}
