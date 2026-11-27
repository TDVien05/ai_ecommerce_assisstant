import type { OrderDetail, OrderStatus } from '@/lib/orders/types'
import type { Payment } from '@/lib/payments/types'
import type { LedgerEntry } from '@/lib/finance/types'
import type { Alert } from '@/lib/alerts/types'

const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString()
function order(id: string, paymentCode: string, customerName: string, total: number, status: OrderStatus): OrderDetail {
  return { id, paymentCode, customerName, status, subtotal: total, shippingFee: 0, total, createdAt: ago(2000), paidAt: status === 'AWAITING_PAYMENT' ? null : ago(1000), expiresAt: null, shippingPhone: null, shippingAddress: null, items: [{ name: 'Sản phẩm mẫu', variant: null, unitPrice: total, quantity: 1, lineTotal: total }], payments: [] }
}
function payment(id: string, minutes: number, transferType: Payment['transferType'], transferAmount: number, content: string, matchStatus: Payment['matchStatus'], extra: Partial<Payment> = {}): Payment {
  return { id, gateway: 'Vietcombank', accountNumber: '1017588888', code: null, content, referenceCode: `FT-MAU-${id.toUpperCase()}`, transferType, transferAmount, transactionDate: ago(minutes), orderId: null, orderCode: null, shortfall: null, matchStatus, ...extra }
}

export const store: { orders: OrderDetail[]; payments: Payment[]; entries: LedgerEntry[]; alerts: Alert[]; heldOrders: Set<string>; manualAssignments: Map<string, { orderId: string; entryId: string | null }> } = {
  orders: [order('o1', 'DH8F3K2A', 'An', 250000, 'PAID'), order('o2', 'DH5MNP7Q', 'Bình', 350000, 'AWAITING_PAYMENT'), order('o3', 'DH2RTV9X', 'Chi', 690000, 'PAID'), order('o4', 'DH7KQW3E', 'Hoa', 320000, 'AWAITING_PAYMENT'), order('o5', 'DH4HJU8M', 'Minh', 550000, 'AWAITING_PAYMENT'), order('o6', 'DH9PLC2T', 'Thu', 480000, 'AWAITING_PAYMENT')],
  payments: [payment('p1', 12, 'in', 250000, 'DH8F3K2A chuyen tien', 'MATCHED', { code: 'DH8F3K2A', orderId: 'o1', orderCode: 'DH8F3K2A' }), payment('p2', 47, 'in', 320000, 'NGUYEN THI HOA chuyen tien ao', 'NO_ORDER'), payment('p3', 80, 'in', 200000, 'DH5MNP7Q thanh toan', 'UNDERPAID', { code: 'DH5MNP7Q', orderId: 'o2', orderCode: 'DH5MNP7Q', shortfall: 150000 }), payment('p4', 135, 'out', 350000, 'CK NGUYEN VAN B', 'IGNORED'), payment('p5', 260, 'in', 480000, 'Tra tien vay thang 11', 'NO_ORDER'), payment('p6', 1500, 'in', 690000, 'DH2RTV9X', 'MATCHED', { code: 'DH2RTV9X', orderId: 'o3', orderCode: 'DH2RTV9X' }), payment('p7', 1630, 'out', 120000, 'GRAB*A2F', 'IGNORED')],
  entries: [
    { id: 'entry-p1', type: 'INCOME', category: 'SALES', amount: 250000, orderId: 'o1', orderCode: 'DH8F3K2A', note: null, occurredAt: ago(12), manual: false },
    { id: 'entry-p6', type: 'INCOME', category: 'SALES', amount: 690000, orderId: 'o3', orderCode: 'DH2RTV9X', note: null, occurredAt: ago(1500), manual: false },
  ],
  alerts: [
    { id: 'a1', level: 'high', title: 'Đơn DH7KQW3E cần kiểm tra', reasons: ['Khách gửi ảnh chuyển khoản nhưng ngân hàng chưa báo tiền vào.', 'Thông tin trên ảnh không trùng tài khoản cửa hàng.'], orderId: 'o4', orderCode: 'DH7KQW3E', detectedAt: ago(20), status: 'OPEN' },
    { id: 'a2', level: 'mid', title: 'Đơn DH4HJU8M cần kiểm tra', reasons: ['Nội dung chuyển khoản chưa khớp mã đơn.'], orderId: 'o5', orderCode: 'DH4HJU8M', detectedAt: ago(80), status: 'OPEN' },
  ],
  heldOrders: new Set(),
  manualAssignments: new Map(),
}

export function respond<T>(data: T): Promise<T> {
  const copy = structuredClone(data)
  return new Promise((resolve) => setTimeout(() => resolve(copy), 250))
}
