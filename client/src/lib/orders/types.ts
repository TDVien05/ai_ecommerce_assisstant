import type { Payment } from '@/lib/payments/types'

/**
 * Method | Path | Request | Response | Lỗi
 * GET | /api/orders | status?, from?, to? | { items: Order[] } | 400, 401
 * GET | /api/orders/:id | — | { order: OrderDetail } | 401, 404
 * PATCH | /api/orders/:id/status | { status: OrderTransition } | { order: Order } | 400, 401, 404, 409
 * Các hình dạng response và mã lỗi là đề xuất cần server xác nhận.
 */
export type OrderStatus = 'AWAITING_PAYMENT' | 'PAID' | 'SHIPPING' | 'COMPLETED' | 'CANCELLED' | 'EXPIRED' | 'REFUNDED'
export type OrderTransition = 'SHIPPING' | 'COMPLETED' | 'CANCELLED'

/** Tiền là số nguyên VND; thời gian theo ISO 8601. */
export type Order = {
  id: string
  paymentCode: string
  customerName: string
  status: OrderStatus
  subtotal: number
  shippingFee: number
  total: number
  createdAt: string
  paidAt: string | null
  expiresAt: string | null
}

export type OrderItem = {
  name: string
  variant: Record<string, string> | null
  unitPrice: number
  quantity: number
  lineTotal: number
}

export type OrderDetail = Order & {
  shippingPhone: string | null
  shippingAddress: string | null
  items: OrderItem[]
  payments: Payment[]
}

export interface OrdersApi {
  list(query?: { status?: OrderStatus; from?: string; to?: string }): Promise<{ items: Order[] }>
  get(id: string): Promise<{ order: OrderDetail }>
  updateStatus(id: string, body: { status: OrderTransition }): Promise<{ order: Order }>
}
