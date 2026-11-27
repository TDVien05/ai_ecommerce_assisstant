// Máy chủ giả lập cho trang giao dịch. Việc đối soát và tính tiền ở đây đóng vai server.
import { ApiError } from '@/lib/api'
import { formatVND } from '@/lib/format'
import type { MatchStatus, Payment, PaymentsApi, PendingOrder } from './types'

const DELAY = 250

/** Mốc giờ cách hiện tại `minutes` phút. */
const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString()

function payment(
  id: string,
  minutes: number,
  transferType: Payment['transferType'],
  transferAmount: number,
  content: string,
  matchStatus: MatchStatus,
  extra: Partial<Payment> = {},
): Payment {
  return {
    id,
    gateway: 'Vietcombank',
    accountNumber: '1017588888',
    code: null,
    content,
    referenceCode: `FT-MAU-${id.toUpperCase()}`,
    transferType,
    transferAmount,
    transactionDate: ago(minutes),
    orderId: null,
    orderCode: null,
    shortfall: null,
    matchStatus,
    ...extra,
  }
}

export class MockPaymentsApi implements PaymentsApi {
  private payments: Payment[] = [
    payment('p1', 12, 'in', 250_000, 'DH8F3K2A chuyen tien', 'MATCHED', {
      code: 'DH8F3K2A',
      orderId: 'o1',
      orderCode: 'DH8F3K2A',
    }),
    payment('p2', 47, 'in', 320_000, 'NGUYEN THI HOA chuyen tien ao', 'NO_ORDER'),
    payment('p3', 80, 'in', 200_000, 'DH5MNP7Q thanh toan', 'UNDERPAID', {
      code: 'DH5MNP7Q',
      orderId: 'o2',
      orderCode: 'DH5MNP7Q',
      shortfall: 150_000,
    }),
    payment('p4', 135, 'out', 350_000, 'CK NGUYEN VAN B', 'IGNORED'),
    payment('p5', 260, 'in', 480_000, 'Tra tien vay thang 11', 'NO_ORDER'),
    payment('p6', 1500, 'in', 690_000, 'DH2RTV9X', 'MATCHED', {
      code: 'DH2RTV9X',
      orderId: 'o3',
      orderCode: 'DH2RTV9X',
    }),
    payment('p7', 1630, 'out', 120_000, 'GRAB*A2F', 'IGNORED'),
  ]

  private orders: PendingOrder[] = [
    { id: 'o4', paymentCode: 'DH7KQW3E', customerName: 'Hoa', total: 320_000 },
    { id: 'o5', paymentCode: 'DH4HJU8M', customerName: 'Minh', total: 550_000 },
    { id: 'o6', paymentCode: 'DH9PLC2T', customerName: 'Thu', total: 480_000 },
  ]

  async list(query: { match_status?: MatchStatus } = {}) {
    const items = this.payments.filter((p) => !query.match_status || p.matchStatus === query.match_status)
    return this.respond({ items })
  }

  async pendingOrders() {
    const taken = new Set(this.payments.map((p) => p.orderId))
    return this.respond({ items: this.orders.filter((o) => !taken.has(o.id)) })
  }

  async assign(paymentId: string, { orderId }: { orderId: string }) {
    const current = this.find(paymentId)
    const order = this.orders.find((o) => o.id === orderId)
    if (current.matchStatus !== 'NO_ORDER' || current.transferType !== 'in') {
      throw new ApiError(409, 'PAYMENT_NOT_ASSIGNABLE', 'Chỉ gán được giao dịch tiền vào chưa có đơn.')
    }
    if (!order || this.payments.some((p) => p.orderId === orderId)) {
      throw new ApiError(409, 'ORDER_NOT_PENDING', 'Đơn này không còn chờ thanh toán. Bạn tải lại trang nhé.')
    }
    const shortfall = order.total - current.transferAmount
    const updated = this.save({
      ...current,
      orderId,
      orderCode: order.paymentCode,
      matchStatus: shortfall > 0 ? 'UNDERPAID' : 'MATCHED',
      shortfall: shortfall > 0 ? shortfall : null,
    })
    return this.respond({
      payment: updated,
      message: `Đã gán giao dịch ${formatVND(current.transferAmount)} vào đơn ${order.paymentCode}.`,
    })
  }

  async unassign(paymentId: string) {
    const current = this.find(paymentId)
    return this.respond({
      payment: this.save({ ...current, orderId: null, orderCode: null, shortfall: null, matchStatus: 'NO_ORDER' }),
    })
  }

  private find(id: string) {
    const found = this.payments.find((p) => p.id === id)
    if (!found) throw new ApiError(404, 'PAYMENT_NOT_FOUND', 'Không tìm thấy giao dịch.')
    return found
  }

  private save(next: Payment) {
    this.payments = this.payments.map((p) => (p.id === next.id ? next : p))
    return next
  }

  /** Trả bản sao sau một khoảng trễ, như gọi mạng. */
  private respond<T>(data: T): Promise<T> {
    const copy = JSON.parse(JSON.stringify(data)) as T
    return new Promise((resolve) => setTimeout(() => resolve(copy), DELAY))
  }
}
