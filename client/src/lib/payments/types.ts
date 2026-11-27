// Giao dịch ngân hàng (bảng payment_transactions). Xem docs/API.md#thanh-toán và docs/DATABASE.md.

export type MatchStatus = 'MATCHED' | 'UNDERPAID' | 'NO_ORDER' | 'IGNORED'

export type Payment = {
  id: string
  gateway: string
  accountNumber: string
  code: string | null
  content: string
  referenceCode: string
  transferType: 'in' | 'out'
  /** Số nguyên VND, luôn dương. Chiều tiền xem transferType. */
  transferAmount: number
  /** ISO 8601 */
  transactionDate: string
  orderId: string | null
  orderCode: string | null
  /** Còn thiếu bao nhiêu khi UNDERPAID. Server tính. */
  shortfall: number | null
  matchStatus: MatchStatus
}

export type PendingOrder = {
  id: string
  paymentCode: string
  customerName: string
  total: number
}

export type AssignResponse = { payment: Payment; message: string }

export interface PaymentsApi {
  list(query?: { match_status?: MatchStatus }): Promise<{ items: Payment[] }>
  /** Đơn đang chờ thanh toán, để gán tay. */
  pendingOrders(): Promise<{ items: PendingOrder[] }>
  assign(paymentId: string, body: { orderId: string }): Promise<AssignResponse>
  /** Hoàn tác việc gán tay. Chưa có trong docs/API.md, đang đề xuất. */
  unassign(paymentId: string): Promise<{ payment: Payment }>
}
