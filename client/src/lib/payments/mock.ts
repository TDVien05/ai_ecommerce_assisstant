// Máy chủ giả lập: đối soát và tính tiền tập trung tại kho chung.
import { ApiError } from '@/lib/api'
import { formatVND } from '@/lib/format'
import { respond, store } from '@/lib/mockServer/store'
import type { MatchStatus, Payment, PaymentsApi } from './types'

export class MockPaymentsApi implements PaymentsApi {
  async list(query: { match_status?: MatchStatus } = {}) {
    return respond({ items: store.payments.filter((p) => !query.match_status || p.matchStatus === query.match_status) })
  }
  async pendingOrders() {
    const taken = new Set(store.payments.map((p) => p.orderId))
    return respond({ items: store.orders.filter((o) => o.status === 'AWAITING_PAYMENT' && !taken.has(o.id)).map(({ id, paymentCode, customerName, total }) => ({ id, paymentCode, customerName, total })) })
  }
  async assign(paymentId: string, { orderId }: { orderId: string }) {
    const current = this.find(paymentId)
    const order = store.orders.find((o) => o.id === orderId)
    if (current.matchStatus !== 'NO_ORDER' || current.transferType !== 'in') throw new ApiError(409, 'PAYMENT_NOT_ASSIGNABLE', 'Chỉ gán được giao dịch tiền vào chưa có đơn.')
    if (!order || order.status !== 'AWAITING_PAYMENT' || store.payments.some((p) => p.orderId === orderId)) throw new ApiError(409, 'ORDER_NOT_PENDING', 'Đơn này không còn chờ thanh toán. Bạn tải lại trang nhé.')
    const shortfall = Math.max(0, order.total - current.transferAmount)
    let entryId: string | null = null
    if (shortfall === 0) {
      order.status = 'PAID'
      order.paidAt = new Date().toISOString()
      entryId = `entry-${paymentId}`
      store.entries.push({ id: entryId, type: 'INCOME', category: 'SALES', amount: current.transferAmount, orderId, orderCode: order.paymentCode, note: null, occurredAt: order.paidAt, manual: false })
    }
    Object.assign(current, { orderId, orderCode: order.paymentCode, matchStatus: shortfall ? 'UNDERPAID' : 'MATCHED', shortfall: shortfall || null })
    store.manualAssignments.set(paymentId, { orderId, entryId })
    return respond({ payment: current, message: `Đã gán giao dịch ${formatVND(current.transferAmount)} vào đơn ${order.paymentCode}.` })
  }
  async unassign(paymentId: string) {
    const current = this.find(paymentId)
    const assignment = store.manualAssignments.get(paymentId)
    const order = store.orders.find((o) => o.id === assignment?.orderId)
    if (!assignment || !order || (assignment.entryId && order.status !== 'PAID')) throw new ApiError(409, 'PAYMENT_NOT_UNASSIGNABLE', 'Không thể hoàn tác giao dịch này.')
    if (assignment.entryId) {
      order.status = 'AWAITING_PAYMENT'; order.paidAt = null
      store.entries = store.entries.filter((entry) => entry.id !== assignment.entryId)
    }
    store.manualAssignments.delete(paymentId)
    Object.assign(current, { orderId: null, orderCode: null, shortfall: null, matchStatus: 'NO_ORDER' })
    return respond({ payment: current })
  }
  private find(id: string): Payment {
    const found = store.payments.find((p) => p.id === id)
    if (!found) throw new ApiError(404, 'PAYMENT_NOT_FOUND', 'Không tìm thấy giao dịch.')
    return found
  }
}
