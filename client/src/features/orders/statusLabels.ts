import type { OrderStatus } from '@/lib/orders'

export const statusLabels: Record<OrderStatus, string> = { AWAITING_PAYMENT: 'Chờ thanh toán', PAID: 'Đã thanh toán', SHIPPING: 'Đang giao', COMPLETED: 'Hoàn thành', CANCELLED: 'Đã hủy', EXPIRED: 'Hết hạn', REFUNDED: 'Đã hoàn tiền' }
